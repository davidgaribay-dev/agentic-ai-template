"""Centralized exception hierarchy for the application.

All custom exceptions inherit from AppException, which provides:
- Consistent error response format
- HTTP status codes
- Machine-readable error codes
- Optional details dict for additional context

Exception handlers in main.py convert these to JSON responses.
"""

from typing import Any


class AppException(Exception):
    """Base exception for all application errors.

    Provides a consistent structure for error responses with:
    - message: Human-readable error description
    - error_code: Machine-readable code (e.g., "AUTH_FAILED")
    - status_code: HTTP status code
    - details: Optional dict with additional context
    """

    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: dict[str, Any] | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        """Convert exception to a dict for JSON serialization."""
        return {
            "error_code": self.error_code,
            "message": self.message,
            "details": self.details,
        }


class AuthenticationError(AppException):
    """User authentication failed (invalid credentials, expired token, etc.)."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, "AUTH_FAILED", 401)


class AuthorizationError(AppException):
    """User is authenticated but lacks permission for this action."""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(message, "FORBIDDEN", 403)


class ResourceNotFoundError(AppException):
    """Requested resource does not exist."""

    def __init__(self, resource: str, identifier: str | None = None):
        msg = f"{resource} not found"
        if identifier:
            msg = f"{resource} not found: {identifier}"
        super().__init__(
            msg,
            f"{resource.upper().replace(' ', '_')}_NOT_FOUND",
            404,
            {"resource": resource, "id": identifier}
            if identifier
            else {"resource": resource},
        )


class ResourceExistsError(AppException):
    """Resource already exists (duplicate key, unique constraint violation)."""

    def __init__(self, resource: str, field: str | None = None):
        msg = f"{resource} already exists"
        if field:
            msg = f"{resource} with this {field} already exists"
        super().__init__(
            msg,
            f"{resource.upper().replace(' ', '_')}_EXISTS",
            409,
            {"resource": resource, "field": field} if field else {"resource": resource},
        )


class ValidationError(AppException):
    """Request validation failed (beyond Pydantic's automatic validation)."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(
            message,
            "VALIDATION_ERROR",
            422,
            {"field": field} if field else {},
        )


class RateLimitError(AppException):
    """Rate limit exceeded for this endpoint/user."""

    def __init__(
        self, message: str = "Rate limit exceeded", retry_after: int | None = None
    ):
        super().__init__(
            message,
            "RATE_LIMIT_EXCEEDED",
            429,
            {"retry_after": retry_after} if retry_after else {},
        )


class ExternalServiceError(AppException):
    """External service (Infisical, OpenSearch, etc.) is unavailable or failed."""

    def __init__(self, service: str, message: str | None = None):
        msg = f"{service} is unavailable"
        if message:
            msg = f"{service}: {message}"
        super().__init__(
            msg,
            "EXTERNAL_SERVICE_ERROR",
            503,
            {"service": service},
        )


class TimeoutError(AppException):
    """Operation timed out."""

    def __init__(self, operation: str, timeout_seconds: float | None = None):
        msg = f"{operation} timed out"
        if timeout_seconds:
            msg = f"{operation} timed out after {timeout_seconds}s"
        super().__init__(
            msg,
            "TIMEOUT",
            504,
            {"operation": operation, "timeout_seconds": timeout_seconds}
            if timeout_seconds
            else {"operation": operation},
        )


class AgentError(AppException):
    """Base exception for agent-related errors."""

    def __init__(
        self,
        message: str,
        error_code: str = "AGENT_ERROR",
        status_code: int = 500,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message, error_code, status_code, details)


class LLMConfigurationError(AgentError):
    """LLM API key not configured at any level."""

    def __init__(self, provider: str | None = None, scope: str | None = None):
        msg = "No LLM API key configured"
        if provider and scope:
            msg = f"No {provider} API key configured at {scope} level"
        elif provider:
            msg = f"No {provider} API key configured"
        super().__init__(
            msg,
            "LLM_NOT_CONFIGURED",
            503,
            {"provider": provider, "scope": scope} if provider else {},
        )


class LLMInvocationError(AgentError):
    """LLM API call failed (rate limit, invalid request, etc.)."""

    def __init__(self, message: str, provider: str | None = None):
        super().__init__(
            message,
            "LLM_INVOCATION_FAILED",
            502,
            {"provider": provider} if provider else {},
        )


class ToolExecutionError(AgentError):
    """MCP or built-in tool execution failed."""

    def __init__(self, tool_name: str, reason: str):
        super().__init__(
            f"Tool '{tool_name}' failed: {reason}",
            "TOOL_EXECUTION_FAILED",
            500,
            {"tool": tool_name, "reason": reason},
        )


class ToolApprovalRequiredError(AgentError):
    """Tool requires user approval before execution (not an error, but an interrupt)."""

    def __init__(
        self, tool_name: str, tool_call_id: str, args: dict[str, Any] | None = None
    ):
        super().__init__(
            f"Tool '{tool_name}' requires approval",
            "TOOL_APPROVAL_REQUIRED",
            202,  # Accepted - request is being processed but needs user action
            {"tool_name": tool_name, "tool_call_id": tool_call_id, "args": args or {}},
        )


class ConversationError(AgentError):
    """Conversation-specific errors (not found, access denied, etc.)."""

    def __init__(self, message: str, conversation_id: str | None = None):
        super().__init__(
            message,
            "CONVERSATION_ERROR",
            400,
            {"conversation_id": conversation_id} if conversation_id else {},
        )


class StreamError(AgentError):
    """SSE streaming error."""

    def __init__(self, message: str, thread_id: str | None = None):
        super().__init__(
            message,
            "STREAM_ERROR",
            500,
            {"thread_id": thread_id} if thread_id else {},
        )


class MCPServerError(AppException):
    """MCP server connection or execution error."""

    def __init__(self, server_name: str, message: str):
        super().__init__(
            f"MCP server '{server_name}': {message}",
            "MCP_SERVER_ERROR",
            502,
            {"server_name": server_name},
        )


class MCPToolNotFoundError(AppException):
    """Requested MCP tool not found on any configured server."""

    def __init__(self, tool_name: str):
        super().__init__(
            f"MCP tool not found: {tool_name}",
            "MCP_TOOL_NOT_FOUND",
            404,
            {"tool_name": tool_name},
        )
