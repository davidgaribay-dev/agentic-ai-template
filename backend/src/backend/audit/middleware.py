"""Application logging middleware.

Uses pure ASGI middleware to properly support contextvars propagation.
See: https://github.com/encode/starlette/discussions/1729
"""

from http import HTTPStatus
import time
import traceback
import uuid

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from backend.audit.schemas import LogLevel
from backend.audit.service import audit_service
from backend.core.logging import get_logger

logger = get_logger(__name__)

# Default paths to exclude from logging
DEFAULT_EXCLUDE_PATHS = frozenset(
    {
        "/health",
        "/v1/docs",
        "/v1/openapi.json",
        "/v1/redoc",
    }
)


class AuditLoggingMiddleware:
    """Pure ASGI middleware for automatic application log capture.

    This middleware captures request/response metadata for application
    logs (not audit logs - those are explicit). It logs:
    - Request start/end with timing
    - Errors and exceptions
    - Slow requests (configurable threshold)

    Audit events should be logged explicitly in route handlers
    using audit_service.log() for better control over what's logged.

    Uses pure ASGI instead of BaseHTTPMiddleware to properly support
    contextvars propagation from route handlers.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        slow_request_threshold_ms: float = 1000.0,
        exclude_paths: set[str] | None = None,
    ) -> None:
        self.app = app
        self.slow_request_threshold_ms = slow_request_threshold_ms
        self.exclude_paths = (
            frozenset(exclude_paths) if exclude_paths else DEFAULT_EXCLUDE_PATHS
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """ASGI interface."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Get path from scope
        path = scope.get("path", "")

        # Skip excluded paths
        if path in self.exclude_paths:
            await self.app(scope, receive, send)
            return

        # Extract request context
        headers = Headers(scope=scope)
        request_id = headers.get("X-Request-ID", str(uuid.uuid4()))
        method = scope.get("method", "UNKNOWN")
        query_string = scope.get("query_string", b"").decode("utf-8", "ignore")
        query = query_string if query_string else None

        # Get client info
        client = scope.get("client")
        client_ip = self._get_client_ip(headers, client)
        user_agent = headers.get("User-Agent")

        # Start timing
        start_time = time.perf_counter()
        status_code = 500  # Default to error if not set
        exception_info: dict | None = None

        async def send_wrapper(message: Message) -> None:
            """Capture response status code."""
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:
            exception_info = {
                "type": type(e).__name__,
                "message": str(e),
                "traceback": traceback.format_exc(),
            }
            raise
        finally:
            # Calculate duration
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Determine log level based on outcome
            if exception_info or status_code >= HTTPStatus.INTERNAL_SERVER_ERROR:
                level = LogLevel.ERROR
            elif (
                status_code >= HTTPStatus.BAD_REQUEST
                or duration_ms > self.slow_request_threshold_ms
            ):
                level = LogLevel.WARNING
            else:
                level = LogLevel.INFO

            # Build log message
            message_text = f"{method} {path} -> {status_code} ({duration_ms:.1f}ms)"

            # Log to OpenSearch
            await audit_service.log_app(
                level=level,
                logger_name="http.request",
                message=message_text,
                request_id=request_id,
                duration_ms=duration_ms,
                extra={
                    "method": method,
                    "path": path,
                    "query": query,
                    "status_code": status_code,
                    "client_ip": client_ip,
                    "user_agent": user_agent,
                },
                exception_type=exception_info["type"] if exception_info else None,
                exception_message=exception_info["message"] if exception_info else None,
                stack_trace=exception_info["traceback"] if exception_info else None,
            )

    def _get_client_ip(
        self, headers: Headers, client: tuple[str, int] | None
    ) -> str | None:
        """Extract client IP, handling proxies."""
        forwarded = headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return client[0] if client else None
