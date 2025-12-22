"""Type definitions for MCP (Model Context Protocol) data structures.

Uses TypedDict for structured typing of MCP-related data,
replacing dict[str, Any] for better type safety and IDE support.
"""

from typing import Any, NotRequired, TypedDict


class MCPServerConfig(TypedDict):
    """Configuration for connecting to an MCP server."""

    id: str
    name: str
    url: str
    transport: str  # "http" | "sse" | "streamable_http"
    auth_type: str  # "none" | "bearer" | "api_key"
    auth_header_name: NotRequired[str]
    auth_secret: NotRequired[str]  # Only present when retrieved from Infisical
    enabled: bool
    tool_prefix: bool
    scope: str  # "org" | "team" | "user"


class MCPToolInputSchema(TypedDict, total=False):
    """JSON Schema for tool input parameters."""

    type: str
    properties: dict[str, Any]
    required: list[str]


class MCPToolDefinition(TypedDict):
    """Definition of a tool provided by an MCP server."""

    name: str
    description: str
    input_schema: MCPToolInputSchema


class MCPServerWithTools(TypedDict):
    """MCP server with its discovered tools."""

    server_id: str
    server_name: str
    server_description: str | None
    scope: str
    enabled: bool
    tools: list[MCPToolDefinition]
    tool_count: int
    error: NotRequired[str]


class MCPToolsList(TypedDict):
    """Response from effective-tools endpoint."""

    servers: list[MCPServerWithTools]
    total_tools: int
    total_servers: int
    error_count: int


class ToolCallRequest(TypedDict):
    """Request to execute a tool."""

    name: str
    args: dict[str, Any]
    tool_call_id: str


class ToolCallResult(TypedDict):
    """Result from executing a tool."""

    tool_name: str
    tool_call_id: str
    result: str | dict[str, Any]
    error: NotRequired[str]
    is_error: bool


class ToolApprovalRequest(TypedDict):
    """Data sent to frontend for tool approval."""

    type: str  # "tool_approval"
    tool_name: str
    tool_args: dict[str, Any]
    tool_call_id: str
    tool_description: str


class ToolApprovalResponse(TypedDict):
    """User's response to tool approval request."""

    approved: bool
    tool_call_id: str


class MCPClientError(TypedDict):
    """Error from MCP client operations."""

    server_name: str
    error_type: str
    message: str
    recoverable: bool


class MCPConnectionStatus(TypedDict):
    """Status of connection to an MCP server."""

    server_id: str
    server_name: str
    connected: bool
    last_check: str  # ISO datetime
    error: NotRequired[str]
    tool_count: NotRequired[int]


class DisabledToolsConfig(TypedDict):
    """Configuration for disabled servers and tools."""

    disabled_server_ids: set[str]
    disabled_tool_names: set[str]
