"""MCP (Model Context Protocol) integration module.

Provides multi-tenant MCP server registry and client management
for integrating external tools via the Model Context Protocol.
"""

from backend.mcp.models import (
    MCPServer,
    MCPServerCreate,
    MCPServerPublic,
    MCPServerUpdate,
)
from backend.mcp.service import (
    create_mcp_server,
    delete_mcp_server,
    get_effective_mcp_servers,
    get_mcp_server,
    list_mcp_servers,
    update_mcp_server,
)

__all__ = [
    "MCPServer",
    "MCPServerCreate",
    "MCPServerPublic",
    "MCPServerUpdate",
    "create_mcp_server",
    "delete_mcp_server",
    "get_effective_mcp_servers",
    "get_mcp_server",
    "list_mcp_servers",
    "update_mcp_server",
]
