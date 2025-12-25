"""Centralized exception hierarchy for the application.

All custom exceptions inherit from AppException, which provides:
- Consistent error response format
- HTTP status codes
- Machine-readable error codes
- i18n support via message_key and params
- Optional details dict for additional context

Exception handlers in main.py convert these to JSON responses.
"""

from typing import Any


class AppException(Exception):
    """Base exception for all application errors.

    Provides a consistent structure for error responses with:
    - message: Human-readable error description (fallback if translation fails)
    - message_key: Translation key for i18n (e.g., "error_auth_failed")
    - params: Interpolation parameters for the translation
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
        *,
        message_key: str | None = None,
        params: dict[str, Any] | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        self.message_key = message_key
        self.params = params or {}
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        """Convert exception to a dict for JSON serialization."""
        result: dict[str, Any] = {
            "error_code": self.error_code,
            "message": self.message,
            "details": self.details,
        }
        if self.message_key:
            result["message_key"] = self.message_key
        return result


class AuthenticationError(AppException):
    """User authentication failed (invalid credentials, expired token, etc.)."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(
            message,
            "AUTH_FAILED",
            401,
            message_key="error_auth_failed",
        )


class AuthorizationError(AppException):
    """User is authenticated but lacks permission for this action."""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(
            message,
            "FORBIDDEN",
            403,
            message_key="error_permission_denied",
        )


class ResourceNotFoundError(AppException):
    """Requested resource does not exist."""

    def __init__(self, resource: str, identifier: str | None = None):
        msg = f"{resource} not found"
        message_key = "error_not_found"
        params: dict[str, Any] = {"resource": resource}
        if identifier:
            msg = f"{resource} not found: {identifier}"
            message_key = "error_not_found_with_id"
            params["id"] = identifier
        super().__init__(
            msg,
            f"{resource.upper().replace(' ', '_')}_NOT_FOUND",
            404,
            {"resource": resource, "id": identifier}
            if identifier
            else {"resource": resource},
            message_key=message_key,
            params=params,
        )


class ResourceExistsError(AppException):
    """Resource already exists (duplicate key, unique constraint violation)."""

    def __init__(self, resource: str, field: str | None = None):
        msg = f"{resource} already exists"
        message_key = "error_already_exists"
        params: dict[str, Any] = {"resource": resource}
        if field:
            msg = f"{resource} with this {field} already exists"
            message_key = "error_already_exists_with_field"
            params["field"] = field
        super().__init__(
            msg,
            f"{resource.upper().replace(' ', '_')}_EXISTS",
            409,
            {"resource": resource, "field": field} if field else {"resource": resource},
            message_key=message_key,
            params=params,
        )


class ValidationError(AppException):
    """Request validation failed (beyond Pydantic's automatic validation)."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(
            message,
            "VALIDATION_ERROR",
            422,
            {"field": field} if field else {},
            message_key="error_validation_with_message",
            params={"message": message},
        )


class RateLimitError(AppException):
    """Rate limit exceeded for this endpoint/user."""

    def __init__(
        self, message: str = "Rate limit exceeded", retry_after: int | None = None
    ):
        message_key = "error_rate_limit"
        params: dict[str, Any] = {}
        if retry_after:
            message_key = "error_rate_limit_with_retry"
            params["seconds"] = retry_after
        super().__init__(
            message,
            "RATE_LIMIT_EXCEEDED",
            429,
            {"retry_after": retry_after} if retry_after else {},
            message_key=message_key,
            params=params,
        )


class ExternalServiceError(AppException):
    """External service (Infisical, OpenSearch, etc.) is unavailable or failed."""

    def __init__(self, service: str, message: str | None = None):
        msg = f"{service} is unavailable"
        message_key = "error_service_unavailable"
        params: dict[str, Any] = {"service": service}
        if message:
            msg = f"{service}: {message}"
            message_key = "error_service_unavailable_with_message"
            params["message"] = message
        super().__init__(
            msg,
            "EXTERNAL_SERVICE_ERROR",
            503,
            {"service": service},
            message_key=message_key,
            params=params,
        )


class TimeoutError(AppException):
    """Operation timed out."""

    def __init__(self, operation: str, timeout_seconds: float | None = None):
        msg = f"{operation} timed out"
        message_key = "error_timeout"
        params: dict[str, Any] = {"operation": operation}
        if timeout_seconds:
            msg = f"{operation} timed out after {timeout_seconds}s"
            message_key = "error_timeout_with_seconds"
            params["seconds"] = timeout_seconds
        super().__init__(
            msg,
            "TIMEOUT",
            504,
            {"operation": operation, "timeout_seconds": timeout_seconds}
            if timeout_seconds
            else {"operation": operation},
            message_key=message_key,
            params=params,
        )


class AgentError(AppException):
    """Base exception for agent-related errors."""

    def __init__(
        self,
        message: str,
        error_code: str = "AGENT_ERROR",
        status_code: int = 500,
        details: dict[str, Any] | None = None,
        *,
        message_key: str | None = None,
        params: dict[str, Any] | None = None,
    ):
        super().__init__(
            message,
            error_code,
            status_code,
            details,
            message_key=message_key,
            params=params,
        )


class LLMConfigurationError(AgentError):
    """LLM API key not configured at any level."""

    def __init__(self, provider: str | None = None, scope: str | None = None):
        msg = "No LLM API key configured"
        message_key = "error_llm_not_configured"
        params: dict[str, Any] = {}
        if provider and scope:
            msg = f"No {provider} API key configured at {scope} level"
            message_key = "error_llm_not_configured_with_scope"
            params = {"provider": provider, "scope": scope}
        elif provider:
            msg = f"No {provider} API key configured"
            message_key = "error_llm_not_configured_with_provider"
            params = {"provider": provider}
        super().__init__(
            msg,
            "LLM_NOT_CONFIGURED",
            503,
            {"provider": provider, "scope": scope} if provider else {},
            message_key=message_key,
            params=params,
        )


class LLMInvocationError(AgentError):
    """LLM API call failed (rate limit, invalid request, etc.)."""

    def __init__(self, message: str, provider: str | None = None):
        super().__init__(
            message,
            "LLM_INVOCATION_FAILED",
            502,
            {"provider": provider} if provider else {},
            message_key="error_llm_invocation_failed_with_message",
            params={"message": message},
        )


class ToolExecutionError(AgentError):
    """MCP or built-in tool execution failed."""

    def __init__(self, tool_name: str, reason: str):
        super().__init__(
            f"Tool '{tool_name}' failed: {reason}",
            "TOOL_EXECUTION_FAILED",
            500,
            {"tool": tool_name, "reason": reason},
            message_key="error_tool_execution_failed",
            params={"tool": tool_name, "reason": reason},
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
            message_key="error_tool_approval_required",
            params={"tool": tool_name},
        )


class ConversationError(AgentError):
    """Conversation-specific errors (not found, access denied, etc.)."""

    def __init__(self, message: str, conversation_id: str | None = None):
        super().__init__(
            message,
            "CONVERSATION_ERROR",
            400,
            {"conversation_id": conversation_id} if conversation_id else {},
            message_key="error_conversation_with_message",
            params={"message": message},
        )


class StreamError(AgentError):
    """SSE streaming error."""

    def __init__(self, message: str, thread_id: str | None = None):
        super().__init__(
            message,
            "STREAM_ERROR",
            500,
            {"thread_id": thread_id} if thread_id else {},
            message_key="error_stream_with_message",
            params={"message": message},
        )


class MCPServerError(AppException):
    """MCP server connection or execution error."""

    def __init__(self, server_name: str, message: str):
        super().__init__(
            f"MCP server '{server_name}': {message}",
            "MCP_SERVER_ERROR",
            502,
            {"server_name": server_name},
            message_key="error_mcp_server",
            params={"server": server_name, "message": message},
        )


class MCPToolNotFoundError(AppException):
    """Requested MCP tool not found on any configured server."""

    def __init__(self, tool_name: str):
        super().__init__(
            f"MCP tool not found: {tool_name}",
            "MCP_TOOL_NOT_FOUND",
            404,
            {"tool_name": tool_name},
            message_key="error_mcp_tool_not_found",
            params={"tool": tool_name},
        )
