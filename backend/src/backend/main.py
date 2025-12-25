"""FastAPI application entry point."""

from contextlib import asynccontextmanager
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from structlog import contextvars

from backend.agents.base import agent_lifespan
from backend.agents.tracing import (
    check_langfuse_connection,
    flush_langfuse,
    shutdown_langfuse,
)
from backend.api.main import api_router
from backend.audit.client import opensearch_lifespan
from backend.audit.middleware import AuditLoggingMiddleware
from backend.audit.service import audit_service
from backend.core.config import settings
from backend.core.exceptions import AppException
from backend.core.logging import get_logger, setup_logging
from backend.core.rate_limit import limiter
from backend.i18n import LocaleMiddleware, get_locale, init_translations, translate
from backend.mcp.client import cleanup_mcp_clients
from backend.memory.store import cleanup_memory_store, init_memory_store

setup_logging()
logger = get_logger(__name__)


def custom_generate_unique_id(route: APIRoute) -> str:
    """Generate unique operation IDs for OpenAPI schema.

    This follows the FastAPI full-stack template pattern for cleaner
    auto-generated client code. Format: {tag}-{route_name}
    """
    if route.tags:
        return f"{route.tags[0]}-{route.name}"
    return route.name


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Check Langfuse connection on startup
    langfuse_connected = check_langfuse_connection()

    # Initialize i18n translations
    init_translations()

    logger.info(
        "application_startup",
        environment=settings.ENVIRONMENT,
        debug=settings.DEBUG,
        llm_provider=settings.DEFAULT_LLM_PROVIDER,
        has_api_key=settings.has_llm_api_key,
        opensearch_enabled=settings.opensearch_enabled,
        langfuse_enabled=settings.langfuse_enabled,
        langfuse_connected=langfuse_connected,
        default_language=settings.DEFAULT_LANGUAGE,
    )

    async with opensearch_lifespan():
        await audit_service.start()

        # Initialize memory store (PostgresStore with semantic search)
        logger.info("memory_store_check", has_openai_key=bool(settings.OPENAI_API_KEY))
        if settings.OPENAI_API_KEY:
            try:
                await init_memory_store()
                logger.info("memory_store_initialized")
            except Exception as e:
                logger.warning(
                    "memory_store_init_failed",
                    error=str(e),
                    error_type=type(e).__name__,
                )

        async with agent_lifespan():
            yield

        # Cleanup MCP clients
        await cleanup_mcp_clients()

        # Cleanup memory store
        await cleanup_memory_store()

        await audit_service.stop()

    # Flush any pending Langfuse events and shutdown on app shutdown
    flush_langfuse()
    shutdown_langfuse()

    logger.info("application_shutdown")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
        lifespan=lifespan,
        generate_unique_id_function=custom_generate_unique_id,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(AppException)
    async def app_exception_handler(
        request: Request, exc: AppException
    ) -> JSONResponse:
        """Handle all AppException subclasses with consistent JSON format.

        Translates error messages based on the request locale (Accept-Language header).
        """
        locale = get_locale()

        # Translate message if message_key is available
        translated_message = exc.message
        if exc.message_key:
            translated_message = translate(exc.message_key, locale, **exc.params)

        logger.warning(
            "app_exception",
            error_code=exc.error_code,
            message=exc.message,
            translated_message=translated_message,
            locale=locale,
            status_code=exc.status_code,
            details=exc.details,
            path=str(request.url.path),
        )

        # Build response content
        content = {
            "error_code": exc.error_code,
            "message": translated_message,
            "details": exc.details,
        }
        if exc.message_key:
            content["message_key"] = exc.message_key

        return JSONResponse(
            status_code=exc.status_code,
            content=content,
            headers={"Content-Language": locale},
        )

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        """Add unique request ID to each request for tracing."""
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        contextvars.clear_contextvars()
        contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        """Add security headers to all responses."""
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # XSS protection (legacy but still useful for older browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Prevent caching of sensitive data
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"

        # Content Security Policy (restrictive default)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "frame-ancestors 'none'"
        )

        # HSTS for production (enforces HTTPS)
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response

    if settings.all_cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.all_cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "X-Request-ID",
                "Accept",
                "Origin",
                "X-Requested-With",
            ],
            expose_headers=["X-Request-ID"],
        )
        logger.info("cors_configured", origins=settings.all_cors_origins)

    app.include_router(api_router, prefix=settings.API_V1_STR)

    if settings.opensearch_enabled:
        app.add_middleware(
            AuditLoggingMiddleware,
            slow_request_threshold_ms=1000.0,
        )
        logger.info("audit_middleware_enabled")

    # Add locale middleware for i18n (parses Accept-Language header)
    # Added AFTER AuditLoggingMiddleware so it runs as outermost layer
    app.add_middleware(LocaleMiddleware, default_locale=settings.DEFAULT_LANGUAGE)

    return app


app = create_app()


@app.get("/health", tags=["health"])
async def root_health():
    """Root health check endpoint."""
    return {"status": "ok", "service": settings.PROJECT_NAME}
