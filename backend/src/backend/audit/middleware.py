import time
import traceback
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from backend.audit.schemas import LogLevel
from backend.audit.service import audit_service
from backend.core.logging import get_logger

logger = get_logger(__name__)


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for automatic application log capture.

    This middleware captures request/response metadata for application
    logs (not audit logs - those are explicit). It logs:
    - Request start/end with timing
    - Errors and exceptions
    - Slow requests (configurable threshold)

    Audit events should be logged explicitly in route handlers
    using audit_service.log() for better control over what's logged.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        slow_request_threshold_ms: float = 1000.0,
        exclude_paths: set[str] | None = None,
    ) -> None:
        super().__init__(app)
        self.slow_request_threshold_ms = slow_request_threshold_ms
        self.exclude_paths = exclude_paths or {
            "/health",
            "/v1/docs",
            "/v1/openapi.json",
            "/v1/redoc",
        }

    async def dispatch(
        self,
        request: Request,
        call_next: Callable,
    ) -> Response:
        # Skip excluded paths
        if request.url.path in self.exclude_paths:
            return await call_next(request)

        # Generate request ID if not present
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        # Extract context
        method = request.method
        path = request.url.path
        query = str(request.query_params) if request.query_params else None

        # Start timing
        start_time = time.perf_counter()

        # Process request
        response: Response | None = None
        exception_info: dict | None = None

        try:
            response = await call_next(request)
            return response

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
            status_code = response.status_code if response else 500

            # Determine log level based on outcome
            if exception_info:
                level = LogLevel.ERROR
            elif status_code >= 500:
                level = LogLevel.ERROR
            elif status_code >= 400:
                level = LogLevel.WARNING
            elif duration_ms > self.slow_request_threshold_ms:
                level = LogLevel.WARNING
            else:
                level = LogLevel.INFO

            # Build log message
            message = f"{method} {path} -> {status_code} ({duration_ms:.1f}ms)"

            # Log to OpenSearch
            await audit_service.log_app(
                level=level,
                logger_name="http.request",
                message=message,
                request_id=request_id,
                duration_ms=duration_ms,
                extra={
                    "method": method,
                    "path": path,
                    "query": query,
                    "status_code": status_code,
                    "client_ip": self._get_client_ip(request),
                    "user_agent": request.headers.get("User-Agent"),
                },
                exception_type=exception_info["type"] if exception_info else None,
                exception_message=exception_info["message"] if exception_info else None,
                stack_trace=exception_info["traceback"] if exception_info else None,
            )

    def _get_client_ip(self, request: Request) -> str | None:
        """Extract client IP, handling proxies."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else None
