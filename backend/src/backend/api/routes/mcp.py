"""MCP Server API routes.

Provides endpoints for managing MCP server registrations at
organization, team, and user levels.
"""

import time
from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from sqlmodel import SQLModel

from backend.audit import audit_service
from backend.audit.schemas import AuditAction, Target
from backend.auth.deps import CurrentUser, SessionDep
from backend.mcp.client import test_mcp_server_connection
from backend.mcp.models import (
    MCPServerCreate,
    MCPServerList,
    MCPServerPublic,
    MCPServerUpdate,
    MCPServerWithTools,
    MCPToolPublic,
    MCPToolsList,
)
from backend.mcp.service import (
    check_server_limits,
    create_mcp_server,
    delete_mcp_server,
    get_effective_mcp_servers,
    get_mcp_server,
    list_org_level_servers,
    list_team_level_servers,
    list_user_level_servers,
    update_mcp_server,
)
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    TeamContextDep,
    TeamPermission,
    require_org_permission,
    require_team_permission,
)
from backend.settings.service import get_effective_settings

# Organization-level MCP server routes
org_router = APIRouter(
    prefix="/organizations/{organization_id}/mcp-servers", tags=["mcp"]
)

# Team-level MCP server routes
team_router = APIRouter(
    prefix="/organizations/{organization_id}/teams/{team_id}/mcp-servers",
    tags=["mcp"],
)

# User-level MCP server routes
user_router = APIRouter(prefix="/mcp-servers", tags=["mcp"])


# =============================================================================
# Organization-level endpoints
# =============================================================================


@org_router.get(
    "",
    response_model=MCPServerList,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
def list_org_mcp_servers(
    session: SessionDep,
    org_context: OrgContextDep,
) -> MCPServerList:
    """List organization-level MCP servers.

    Returns servers configured at the organization level (not team or user specific).
    Requires org:read permission.
    """
    servers = list_org_level_servers(session, org_context.org_id)
    return MCPServerList(
        data=[MCPServerPublic.from_model(s) for s in servers],
        count=len(servers),
    )


@org_router.post(
    "",
    response_model=MCPServerPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def create_org_mcp_server(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    current_user: CurrentUser,
    data: MCPServerCreate,
) -> MCPServerPublic:
    """Create an organization-level MCP server.

    This server will be available to all members of the organization.
    Requires org:update permission (admin or owner).
    """
    server = create_mcp_server(
        session=session,
        organization_id=org_context.org_id,
        team_id=None,
        user_id=None,
        data=data,
        created_by_id=current_user.id,
    )

    await audit_service.log(
        AuditAction.MCP_SERVER_CREATED,
        actor=current_user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="mcp_server", id=str(server.id), name=server.name)],
        metadata={"scope": "organization", "transport": server.transport},
    )

    return MCPServerPublic.from_model(server)


@org_router.get(
    "/{server_id}",
    response_model=MCPServerPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
def get_org_mcp_server(
    session: SessionDep,
    org_context: OrgContextDep,
    server_id: Annotated[uuid.UUID, Path()],
) -> MCPServerPublic:
    """Get a specific organization-level MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.organization_id != org_context.org_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.team_id is not None or server.user_id is not None:
        raise HTTPException(status_code=404, detail="MCP server not found at org level")
    return MCPServerPublic.from_model(server)


@org_router.patch(
    "/{server_id}",
    response_model=MCPServerPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def update_org_mcp_server(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
    data: MCPServerUpdate,
) -> MCPServerPublic:
    """Update an organization-level MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.organization_id != org_context.org_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.team_id is not None or server.user_id is not None:
        raise HTTPException(status_code=404, detail="MCP server not found at org level")

    # Capture changes for audit
    changes = {}
    update_data = data.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        if field == "auth_secret":
            changes[field] = {"before": "***", "after": "***"}
        else:
            old_value = getattr(server, field, None)
            if old_value != new_value:
                changes[field] = {"before": old_value, "after": new_value}

    updated = update_mcp_server(session, server_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="MCP server not found")

    await audit_service.log(
        AuditAction.MCP_SERVER_UPDATED,
        actor=current_user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="mcp_server", id=str(server_id), name=updated.name)],
        metadata={"scope": "organization"},
        changes=changes if changes else None,
    )

    return MCPServerPublic.from_model(updated)


@org_router.delete(
    "/{server_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def delete_org_mcp_server(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
) -> None:
    """Delete an organization-level MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.organization_id != org_context.org_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.team_id is not None or server.user_id is not None:
        raise HTTPException(status_code=404, detail="MCP server not found at org level")

    server_name = server.name
    delete_mcp_server(session, server_id)

    await audit_service.log(
        AuditAction.MCP_SERVER_DELETED,
        actor=current_user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="mcp_server", id=str(server_id), name=server_name)],
        metadata={"scope": "organization"},
    )


# =============================================================================
# Team-level endpoints
# =============================================================================


@team_router.get(
    "",
    response_model=MCPServerList,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_READ))],
)
def list_team_mcp_servers(
    session: SessionDep,
    team_context: TeamContextDep,
) -> MCPServerList:
    """List team-level MCP servers.

    Returns servers configured at the team level (not org or user specific).
    Requires team:read permission.
    """
    servers = list_team_level_servers(
        session, team_context.org_id, team_context.team_id
    )
    return MCPServerList(
        data=[MCPServerPublic.from_model(s) for s in servers],
        count=len(servers),
    )


@team_router.post(
    "",
    response_model=MCPServerPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def create_team_mcp_server(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    current_user: CurrentUser,
    data: MCPServerCreate,
) -> MCPServerPublic:
    """Create a team-level MCP server.

    This server will be available to all members of the team.
    Requires team:update permission.
    """
    # Check if custom servers are allowed
    effective = get_effective_settings(
        session=session,
        user_id=current_user.id,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
    )
    if not effective.mcp_allow_custom_servers:
        raise HTTPException(
            status_code=403,
            detail=f"Custom MCP servers are disabled at the {effective.mcp_custom_servers_disabled_by} level",
        )

    # Check limits
    allowed, error = check_server_limits(
        session, team_context.org_id, team_context.team_id, None
    )
    if not allowed:
        raise HTTPException(status_code=400, detail=error)

    server = create_mcp_server(
        session=session,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        user_id=None,
        data=data,
        created_by_id=current_user.id,
    )

    await audit_service.log(
        AuditAction.MCP_SERVER_CREATED,
        actor=current_user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="mcp_server", id=str(server.id), name=server.name)],
        metadata={"scope": "team", "transport": server.transport},
    )

    return MCPServerPublic.from_model(server)


@team_router.get(
    "/{server_id}",
    response_model=MCPServerPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_READ))],
)
def get_team_mcp_server(
    session: SessionDep,
    team_context: TeamContextDep,
    server_id: Annotated[uuid.UUID, Path()],
) -> MCPServerPublic:
    """Get a specific team-level MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.team_id != team_context.team_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.user_id is not None:
        raise HTTPException(
            status_code=404, detail="MCP server not found at team level"
        )
    return MCPServerPublic.from_model(server)


@team_router.patch(
    "/{server_id}",
    response_model=MCPServerPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def update_team_mcp_server(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
    data: MCPServerUpdate,
) -> MCPServerPublic:
    """Update a team-level MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.team_id != team_context.team_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.user_id is not None:
        raise HTTPException(
            status_code=404, detail="MCP server not found at team level"
        )

    # Capture changes for audit
    changes = {}
    update_data = data.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        if field == "auth_secret":
            changes[field] = {"before": "***", "after": "***"}
        else:
            old_value = getattr(server, field, None)
            if old_value != new_value:
                changes[field] = {"before": old_value, "after": new_value}

    updated = update_mcp_server(session, server_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="MCP server not found")

    await audit_service.log(
        AuditAction.MCP_SERVER_UPDATED,
        actor=current_user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="mcp_server", id=str(server_id), name=updated.name)],
        metadata={"scope": "team"},
        changes=changes if changes else None,
    )

    return MCPServerPublic.from_model(updated)


@team_router.delete(
    "/{server_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def delete_team_mcp_server(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
) -> None:
    """Delete a team-level MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.team_id != team_context.team_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.user_id is not None:
        raise HTTPException(
            status_code=404, detail="MCP server not found at team level"
        )

    server_name = server.name
    delete_mcp_server(session, server_id)

    await audit_service.log(
        AuditAction.MCP_SERVER_DELETED,
        actor=current_user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="mcp_server", id=str(server_id), name=server_name)],
        metadata={"scope": "team"},
    )


# =============================================================================
# User-level endpoints
# =============================================================================


@user_router.get(
    "/me",
    response_model=MCPServerList,
)
def list_user_mcp_servers(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID, Query()],
    team_id: Annotated[uuid.UUID, Query()],
) -> MCPServerList:
    """List user's personal MCP servers.

    Returns servers configured for the current user in the specified org/team context.
    """
    servers = list_user_level_servers(
        session, organization_id, team_id, current_user.id
    )
    return MCPServerList(
        data=[MCPServerPublic.from_model(s) for s in servers],
        count=len(servers),
    )


@user_router.post(
    "/me",
    response_model=MCPServerPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_user_mcp_server(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID, Query()],
    team_id: Annotated[uuid.UUID, Query()],
    data: MCPServerCreate,
) -> MCPServerPublic:
    """Create a personal MCP server.

    This server will only be available to the current user.
    """
    # Check if custom servers are allowed
    effective = get_effective_settings(
        session=session,
        user_id=current_user.id,
        organization_id=organization_id,
        team_id=team_id,
    )
    if not effective.mcp_allow_custom_servers:
        raise HTTPException(
            status_code=403,
            detail=f"Custom MCP servers are disabled at the {effective.mcp_custom_servers_disabled_by} level",
        )

    # Check limits
    allowed, error = check_server_limits(
        session, organization_id, team_id, current_user.id
    )
    if not allowed:
        raise HTTPException(status_code=400, detail=error)

    server = create_mcp_server(
        session=session,
        organization_id=organization_id,
        team_id=team_id,
        user_id=current_user.id,
        data=data,
        created_by_id=current_user.id,
    )

    await audit_service.log(
        AuditAction.MCP_SERVER_CREATED,
        actor=current_user,
        request=request,
        organization_id=organization_id,
        team_id=team_id,
        targets=[Target(type="mcp_server", id=str(server.id), name=server.name)],
        metadata={"scope": "user", "transport": server.transport},
    )

    return MCPServerPublic.from_model(server)


@user_router.get(
    "/me/{server_id}",
    response_model=MCPServerPublic,
)
def get_user_mcp_server(
    session: SessionDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
) -> MCPServerPublic:
    """Get a specific personal MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return MCPServerPublic.from_model(server)


@user_router.patch(
    "/me/{server_id}",
    response_model=MCPServerPublic,
)
async def update_user_mcp_server(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
    data: MCPServerUpdate,
) -> MCPServerPublic:
    """Update a personal MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="MCP server not found")

    # Capture changes for audit
    changes = {}
    update_data = data.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        if field == "auth_secret":
            changes[field] = {"before": "***", "after": "***"}
        else:
            old_value = getattr(server, field, None)
            if old_value != new_value:
                changes[field] = {"before": old_value, "after": new_value}

    updated = update_mcp_server(session, server_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="MCP server not found")

    await audit_service.log(
        AuditAction.MCP_SERVER_UPDATED,
        actor=current_user,
        request=request,
        organization_id=server.organization_id,
        team_id=server.team_id,
        targets=[Target(type="mcp_server", id=str(server_id), name=updated.name)],
        metadata={"scope": "user"},
        changes=changes if changes else None,
    )

    return MCPServerPublic.from_model(updated)


@user_router.delete(
    "/me/{server_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_user_mcp_server(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
) -> None:
    """Delete a personal MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="MCP server not found")

    server_name = server.name
    org_id = server.organization_id
    team_id = server.team_id
    delete_mcp_server(session, server_id)

    await audit_service.log(
        AuditAction.MCP_SERVER_DELETED,
        actor=current_user,
        request=request,
        organization_id=org_id,
        team_id=team_id,
        targets=[Target(type="mcp_server", id=str(server_id), name=server_name)],
        metadata={"scope": "user"},
    )


# =============================================================================
# Effective servers endpoint (what user can actually use)
# =============================================================================


@user_router.get(
    "/effective",
    response_model=MCPServerList,
)
def list_effective_mcp_servers(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID, Query()],
    team_id: Annotated[uuid.UUID | None, Query()] = None,
) -> MCPServerList:
    """Get all effective MCP servers for the current user.

    Returns all enabled servers the user can access based on:
    - Organization-level servers
    - Team-level servers (if team_id provided)
    - User's personal servers

    This is what will be used when the user chats with the agent.
    """
    servers = get_effective_mcp_servers(
        session=session,
        organization_id=organization_id,
        team_id=team_id,
        user_id=current_user.id,
    )
    return MCPServerList(
        data=[MCPServerPublic.from_model(s) for s in servers],
        count=len(servers),
    )


class MCPTestResult(SQLModel):
    """Result of testing an MCP server connection."""

    success: bool
    message: str
    tools: list[MCPToolPublic]
    tool_count: int
    connection_time_ms: float | None = None
    error_details: str | None = None


@org_router.post(
    "/{server_id}/test",
    response_model=MCPTestResult,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
async def test_org_mcp_server(
    session: SessionDep,
    org_context: OrgContextDep,
    server_id: Annotated[uuid.UUID, Path()],
) -> MCPTestResult:
    """Test connection to an organization-level MCP server.

    Attempts to connect to the server and discover available tools.
    Returns detailed connection status and any errors encountered.
    """
    server = get_mcp_server(session, server_id)
    if not server or server.organization_id != org_context.org_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.team_id is not None or server.user_id is not None:
        raise HTTPException(status_code=404, detail="MCP server not found at org level")

    start_time = time.time()
    result = await test_mcp_server_connection(server, str(org_context.org_id))
    elapsed_ms = (time.time() - start_time) * 1000

    if result["success"]:
        return MCPTestResult(
            success=True,
            message=f"Successfully connected and discovered {result['tool_count']} tools",
            tools=[
                MCPToolPublic(name=t["name"], description=t["description"])
                for t in result["tools"]
            ],
            tool_count=result["tool_count"],
            connection_time_ms=round(elapsed_ms, 2),
        )
    return MCPTestResult(
        success=False,
        message="Failed to connect to MCP server",
        tools=[],
        tool_count=0,
        connection_time_ms=round(elapsed_ms, 2),
        error_details=result.get("error", "Unknown error"),
    )


@team_router.post(
    "/{server_id}/test",
    response_model=MCPTestResult,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_READ))],
)
async def test_team_mcp_server(
    session: SessionDep,
    team_context: TeamContextDep,
    server_id: Annotated[uuid.UUID, Path()],
) -> MCPTestResult:
    """Test connection to a team-level MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.team_id != team_context.team_id:
        raise HTTPException(status_code=404, detail="MCP server not found")
    if server.user_id is not None:
        raise HTTPException(
            status_code=404, detail="MCP server not found at team level"
        )

    start_time = time.time()
    result = await test_mcp_server_connection(server, str(team_context.org_id))
    elapsed_ms = (time.time() - start_time) * 1000

    if result["success"]:
        return MCPTestResult(
            success=True,
            message=f"Successfully connected and discovered {result['tool_count']} tools",
            tools=[
                MCPToolPublic(name=t["name"], description=t["description"])
                for t in result["tools"]
            ],
            tool_count=result["tool_count"],
            connection_time_ms=round(elapsed_ms, 2),
        )
    return MCPTestResult(
        success=False,
        message="Failed to connect to MCP server",
        tools=[],
        tool_count=0,
        connection_time_ms=round(elapsed_ms, 2),
        error_details=result.get("error", "Unknown error"),
    )


@user_router.post(
    "/me/{server_id}/test",
    response_model=MCPTestResult,
)
async def test_user_mcp_server(
    session: SessionDep,
    current_user: CurrentUser,
    server_id: Annotated[uuid.UUID, Path()],
) -> MCPTestResult:
    """Test connection to a personal MCP server."""
    server = get_mcp_server(session, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="MCP server not found")

    start_time = time.time()
    result = await test_mcp_server_connection(server, str(server.organization_id))
    elapsed_ms = (time.time() - start_time) * 1000

    if result["success"]:
        return MCPTestResult(
            success=True,
            message=f"Successfully connected and discovered {result['tool_count']} tools",
            tools=[
                MCPToolPublic(name=t["name"], description=t["description"])
                for t in result["tools"]
            ],
            tool_count=result["tool_count"],
            connection_time_ms=round(elapsed_ms, 2),
        )
    return MCPTestResult(
        success=False,
        message="Failed to connect to MCP server",
        tools=[],
        tool_count=0,
        connection_time_ms=round(elapsed_ms, 2),
        error_details=result.get("error", "Unknown error"),
    )


@user_router.get(
    "/effective/tools",
    response_model=MCPToolsList,
)
async def list_effective_mcp_tools(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID, Query()],
    team_id: Annotated[uuid.UUID | None, Query()] = None,
) -> MCPToolsList:
    """Get all tools from effective MCP servers.

    Connects to each enabled MCP server to discover available tools.
    Returns tools grouped by server with scope information.

    This endpoint is used by the tool configuration UI to show
    which tools are available for enabling/disabling.
    """
    # Check if MCP is enabled
    effective = get_effective_settings(
        session=session,
        user_id=current_user.id,
        organization_id=organization_id,
        team_id=team_id,
    )

    if not effective.mcp_enabled:
        return MCPToolsList(
            servers=[],
            total_tools=0,
            total_servers=0,
            error_count=0,
        )

    # Get effective servers
    servers = get_effective_mcp_servers(
        session=session,
        organization_id=organization_id,
        team_id=team_id,
        user_id=current_user.id,
    )

    if not servers:
        return MCPToolsList(
            servers=[],
            total_tools=0,
            total_servers=0,
            error_count=0,
        )

    # Discover tools from each server
    servers_with_tools: list[MCPServerWithTools] = []
    total_tools = 0
    error_count = 0

    for server in servers:
        result = await test_mcp_server_connection(server, str(organization_id))

        if result["success"]:
            tools = [
                MCPToolPublic(name=t["name"], description=t["description"])
                for t in result["tools"]
            ]
            servers_with_tools.append(
                MCPServerWithTools(
                    server_id=str(server.id),
                    server_name=server.name,
                    server_description=server.description,
                    scope=server.scope,
                    enabled=server.enabled,
                    tools=tools,
                    tool_count=len(tools),
                    error=None,
                )
            )
            total_tools += len(tools)
        else:
            # Include server even if connection failed
            servers_with_tools.append(
                MCPServerWithTools(
                    server_id=str(server.id),
                    server_name=server.name,
                    server_description=server.description,
                    scope=server.scope,
                    enabled=server.enabled,
                    tools=[],
                    tool_count=0,
                    error=result.get("error", "Connection failed"),
                )
            )
            error_count += 1

    return MCPToolsList(
        servers=servers_with_tools,
        total_tools=total_tools,
        total_servers=len(servers),
        error_count=error_count,
    )
