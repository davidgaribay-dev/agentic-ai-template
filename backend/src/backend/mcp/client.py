"""MCP Client Manager for multi-tenant tool integration.

Uses langchain-mcp-adapters to connect to remote MCP servers and
load tools for use with LangGraph agents.

As of langchain-mcp-adapters 0.1.0, MultiServerMCPClient is stateless by default.
Each tool invocation creates a fresh MCP ClientSession, executes the tool,
and then cleans up automatically.
"""

import re
from typing import Any
import uuid

from langchain_core.tools import BaseTool
from sqlmodel import Session

try:
    from langchain_mcp_adapters.client import MultiServerMCPClient
except ImportError:
    MultiServerMCPClient = None  # type: ignore

from backend.core.logging import get_logger
from backend.core.secrets import get_secrets_service
from backend.mcp.models import MCPAuthType, MCPServer, MCPTransport
from backend.mcp.service import get_effective_mcp_servers
from backend.settings.service import get_effective_settings

logger = get_logger(__name__)

# Global client references to keep connections alive
_active_clients: dict[str, Any] = {}


async def get_mcp_tools_for_context(
    org_id: str,
    team_id: str | None,
    user_id: str,
    session: Session,
) -> list[BaseTool]:
    """Get all MCP tools available for a user context.

    This function:
    1. Checks if MCP is enabled in the settings hierarchy
    2. Gets all effective MCP servers for the context
    3. Connects to each server and loads tools
    4. Returns the combined list of tools

    Note: The MCP client connections are maintained globally during the
    request lifecycle to allow tools to make calls back to their servers.

    Args:
        org_id: Organization ID
        team_id: Team ID (optional)
        user_id: User ID
        session: Database session

    Returns:
        List of LangChain-compatible tools from MCP servers
    """
    # Check if MCP is enabled
    effective = get_effective_settings(
        session=session,
        user_id=uuid.UUID(user_id),
        organization_id=uuid.UUID(org_id),
        team_id=uuid.UUID(team_id) if team_id else None,
    )

    if not effective.mcp_enabled:
        logger.info(
            "mcp_disabled",
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            disabled_by=effective.mcp_disabled_by,
        )
        return []

    logger.info("mcp_enabled_getting_servers", org_id=org_id, team_id=team_id)

    # Get effective servers
    servers = get_effective_mcp_servers(
        session=session,
        organization_id=uuid.UUID(org_id),
        team_id=uuid.UUID(team_id) if team_id else None,
        user_id=uuid.UUID(user_id),
    )

    logger.info(
        "mcp_servers_found",
        server_count=len(servers),
        server_names=[s.name for s in servers],
    )

    if not servers:
        logger.info("no_mcp_servers_configured", org_id=org_id, team_id=team_id)
        return []

    # Filter out disabled servers based on user settings
    disabled_server_ids = set(effective.disabled_mcp_servers)
    if disabled_server_ids:
        original_count = len(servers)
        servers = [s for s in servers if str(s.id) not in disabled_server_ids]
        filtered_count = original_count - len(servers)
        logger.info(
            "mcp_servers_filtered_by_settings",
            original_count=original_count,
            filtered_count=filtered_count,
            remaining_count=len(servers),
            disabled_server_ids=list(disabled_server_ids),
        )

        if not servers:
            logger.info("all_mcp_servers_disabled_by_settings")
            return []

    # Build combined config for all servers
    combined_config: dict[str, dict[str, Any]] = {}
    server_prefixes: dict[
        str, tuple[str, bool]
    ] = {}  # server_name -> (original_name, should_prefix)

    for server in servers:
        config = _build_server_config(server, org_id)
        if config:
            server_name = _sanitize_server_name(server.name)
            combined_config[server_name] = config
            server_prefixes[server_name] = (server.name, server.tool_prefix)
            logger.debug(
                "mcp_server_config_built",
                server_name=server_name,
                url=server.url,
                transport=config.get("transport"),
            )

    if not combined_config:
        logger.debug("no_valid_mcp_server_configs", org_id=org_id)
        return []

    # Load tools from all servers at once
    try:
        tools = await _load_tools_from_servers(combined_config, server_prefixes)
        logger.info(
            "mcp_tools_loaded_total",
            server_count=len(combined_config),
            tool_count=len(tools),
        )
    except Exception as e:
        logger.warning(
            "mcp_tools_loading_failed",
            error=str(e),
            server_count=len(combined_config),
        )
        return []
    else:
        return tools


async def _load_tools_from_servers(
    server_configs: dict[str, dict[str, Any]],
    server_prefixes: dict[str, tuple[str, bool]],
) -> list[BaseTool]:
    """Load tools from multiple MCP servers.

    As of langchain-mcp-adapters 0.1.0, MultiServerMCPClient is no longer used
    as a context manager. Instead, you create the client and call get_tools() directly.
    The client maintains its own connection lifecycle internally.

    Args:
        server_configs: Dict of server_name -> config for MultiServerMCPClient
        server_prefixes: Dict of server_name -> (original_name, should_prefix)

    Returns:
        List of tools from all servers
    """
    if MultiServerMCPClient is None:
        logger.exception("langchain_mcp_adapters_not_installed")
        return []

    # Create client - as of 0.1.0, no context manager needed
    client = MultiServerMCPClient(server_configs)

    # Store client to keep connection alive during agent execution
    context_key = str(uuid.uuid4())
    _active_clients[context_key] = client

    try:
        # Get tools directly - client manages connections internally
        tools = await client.get_tools()

        logger.info(
            "mcp_client_connected",
            context_key=context_key,
            tool_count=len(tools),
            tool_names=[t.name for t in tools],
        )

    except Exception:
        _active_clients.pop(context_key, None)
        raise
    else:
        return tools


def _build_server_config(server: MCPServer, org_id: str) -> dict[str, Any] | None:
    """Build langchain-mcp-adapters configuration for a server.

    Args:
        server: MCPServer instance
        org_id: Organization ID (for secret resolution)

    Returns:
        Configuration dict for MultiServerMCPClient, or None if invalid
    """
    # Map transport types
    transport_map = {
        MCPTransport.HTTP.value: "http",
        MCPTransport.SSE.value: "sse",
        MCPTransport.STREAMABLE_HTTP.value: "streamable_http",
        "http": "http",
        "sse": "sse",
        "streamable_http": "streamable_http",
    }

    transport = transport_map.get(server.transport, "http")

    config: dict[str, Any] = {
        "transport": transport,
        "url": server.url,
    }

    # Add authentication headers if configured
    if server.auth_type not in (MCPAuthType.NONE.value, "none"):
        headers = _build_auth_headers(server, org_id)
        if headers:
            config["headers"] = headers

    return config


def _build_auth_headers(server: MCPServer, org_id: str) -> dict[str, str] | None:
    """Build authentication headers for an MCP server.

    Args:
        server: MCPServer instance
        org_id: Organization ID (for Infisical secret resolution)

    Returns:
        Headers dict or None if auth cannot be configured
    """
    if not server.auth_secret_ref or not server.auth_header_name:
        logger.warning(
            "mcp_auth_incomplete",
            server_id=str(server.id),
            auth_type=server.auth_type,
        )
        return None

    # Get the secret value from Infisical
    try:
        secrets_service = get_secrets_service()
        if not secrets_service:
            logger.warning("secrets_service_unavailable")
            return None

        # Use the dedicated MCP auth secret retrieval method
        secret_value = secrets_service.get_mcp_auth_secret(
            server_id=str(server.id),
            org_id=org_id,
            team_id=str(server.team_id) if server.team_id else None,
            user_id=str(server.user_id) if server.user_id else None,
        )

        if not secret_value:
            logger.warning(
                "mcp_secret_not_found",
                server_id=str(server.id),
                secret_ref=server.auth_secret_ref,
            )
            return None

        # Build the header based on auth type
        if server.auth_type in (MCPAuthType.BEARER.value, "bearer"):
            header_value = {server.auth_header_name: f"Bearer {secret_value}"}
        else:
            # API key or other - use value directly
            header_value = {server.auth_header_name: secret_value}

    except Exception as e:
        logger.warning(
            "mcp_secret_retrieval_failed",
            server_id=str(server.id),
            error=str(e),
        )
        return None
    else:
        return header_value


def _sanitize_server_name(name: str) -> str:
    """Sanitize server name for use as a tool prefix.

    Converts to lowercase, replaces spaces with underscores,
    removes special characters. If the sanitized name is empty,
    uses a fallback with a hash suffix to avoid collisions.
    """
    # Lowercase and replace spaces
    sanitized = name.lower().replace(" ", "_").replace("-", "_")
    # Keep only alphanumeric and underscores
    sanitized = re.sub(r"[^a-z0-9_]", "", sanitized)
    # Remove consecutive underscores
    sanitized = re.sub(r"_+", "_", sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip("_")

    if not sanitized:
        # Generate a unique suffix from the original name hash to avoid collisions
        # when multiple servers have names that sanitize to empty strings
        name_hash = abs(hash(name)) % 10000
        return f"mcp_{name_hash}"

    return sanitized


async def test_mcp_server_connection(server: MCPServer, org_id: str) -> dict[str, Any]:
    """Test connection to an MCP server.

    Args:
        server: MCPServer instance to test
        org_id: Organization ID

    Returns:
        Dict with connection status and available tools
    """
    logger.info(
        "mcp_test_connection_start",
        server_id=str(server.id),
        server_name=server.name,
        url=server.url,
        transport=server.transport,
        auth_type=server.auth_type,
        has_auth_secret=bool(server.auth_secret_ref),
    )

    if MultiServerMCPClient is None:
        logger.exception(
            "mcp_test_connection_import_error",
            error="langchain-mcp-adapters not installed",
        )
        return {
            "success": False,
            "error": "langchain-mcp-adapters not installed. Please install with: pip install langchain-mcp-adapters",
            "tools": [],
            "tool_count": 0,
        }

    config = _build_server_config(server, org_id)
    if not config:
        logger.error(
            "mcp_test_connection_config_error",
            server_id=str(server.id),
            error="Failed to build server configuration",
        )
        return {
            "success": False,
            "error": "Invalid server configuration. Check URL and authentication settings.",
            "tools": [],
            "tool_count": 0,
        }

    server_name = _sanitize_server_name(server.name)

    logger.info(
        "mcp_test_connection_attempting",
        server_id=str(server.id),
        server_name=server_name,
        transport=config.get("transport"),
        url=config.get("url"),
        has_headers=bool(config.get("headers")),
    )

    try:
        # As of 0.1.0, MultiServerMCPClient is no longer a context manager
        client = MultiServerMCPClient({server_name: config})
        tools = await client.get_tools()

        logger.info(
            "mcp_test_connection_success",
            server_id=str(server.id),
            server_name=server_name,
            tool_count=len(tools),
            tool_names=[t.name for t in tools],
        )

        return {
            "success": True,
            "tools": [{"name": t.name, "description": t.description} for t in tools],
            "tool_count": len(tools),
        }
    except ConnectionError as e:
        error_msg = f"Connection failed: {e}. Check if the server URL is correct and the server is running."
        logger.exception(
            "mcp_test_connection_network_error",
            server_id=str(server.id),
            server_name=server_name,
            error=str(e),
            error_type="ConnectionError",
        )
        return {
            "success": False,
            "error": error_msg,
            "tools": [],
            "tool_count": 0,
        }
    except TimeoutError as e:
        error_msg = f"Connection timed out: {e}. The server may be slow or unreachable."
        logger.exception(
            "mcp_test_connection_timeout",
            server_id=str(server.id),
            server_name=server_name,
            error=str(e),
            error_type="TimeoutError",
        )
        return {
            "success": False,
            "error": error_msg,
            "tools": [],
            "tool_count": 0,
        }
    except Exception as e:
        error_type = type(e).__name__
        error_str = str(e)

        # Unwrap ExceptionGroup to get the actual underlying error
        actual_error = e
        if isinstance(e, ExceptionGroup) and e.exceptions:
            # Get the first sub-exception for a more useful error message
            actual_error = e.exceptions[0]
            # Recursively unwrap nested ExceptionGroups
            while isinstance(actual_error, ExceptionGroup) and actual_error.exceptions:
                actual_error = actual_error.exceptions[0]
            error_type = type(actual_error).__name__
            error_str = str(actual_error)

        logger.info(
            "mcp_test_connection_unwrapped_error",
            server_id=str(server.id),
            original_error=str(e),
            unwrapped_error=error_str,
            unwrapped_type=error_type,
        )

        # Provide more helpful error messages for common issues
        if "401" in error_str or "Unauthorized" in error_str:
            error_msg = f"Authentication failed (401): {error_str}. Check your API key or bearer token."
        elif "403" in error_str or "Forbidden" in error_str:
            error_msg = f"Access denied (403): {error_str}. Your credentials may lack required permissions."
        elif "404" in error_str or "Not Found" in error_str:
            error_msg = (
                f"Server not found (404): {error_str}. Check the URL path is correct."
            )
        elif "500" in error_str or "Internal Server Error" in error_str:
            error_msg = f"Server error (500): {error_str}. The MCP server encountered an internal error."
        elif "ssl" in error_str.lower() or "certificate" in error_str.lower():
            error_msg = (
                f"SSL/TLS error: {error_str}. Check the server's SSL certificate."
            )
        elif "dns" in error_str.lower() or "resolve" in error_str.lower():
            error_msg = (
                f"DNS resolution failed: {error_str}. Check the server hostname."
            )
        elif "connect" in error_str.lower() or "refused" in error_str.lower():
            error_msg = f"Connection refused: {error_str}. The server may not be running or is blocking connections."
        elif "timeout" in error_str.lower():
            error_msg = f"Connection timed out: {error_str}. The server may be slow or unreachable."
        elif (
            "name or service not known" in error_str.lower()
            or "getaddrinfo" in error_str.lower()
        ):
            error_msg = f"DNS resolution failed: {error_str}. Check the server hostname is correct."
        else:
            error_msg = f"{error_type}: {error_str}"

        logger.exception(
            "mcp_test_connection_error",
            server_id=str(server.id),
            server_name=server_name,
            error=error_str,
            error_type=error_type,
            parsed_error=error_msg,
        )

        return {
            "success": False,
            "error": error_msg,
            "tools": [],
            "tool_count": 0,
        }


async def cleanup_mcp_clients() -> None:
    """Clean up all active MCP client connections.

    Should be called when the application is shutting down.
    As of langchain-mcp-adapters 0.1.0, MultiServerMCPClient is stateless by default
    and manages its own connection lifecycle. We just need to clear our references.
    """
    global _active_clients

    count = len(_active_clients)
    _active_clients.clear()
    logger.info("mcp_clients_cleanup_complete", client_count=count)
