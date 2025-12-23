"""MCP Server CRUD operations and effective server resolution."""

from datetime import UTC, datetime
import uuid

from sqlmodel import Session, or_, select
import structlog

from backend.core.secrets import get_secrets_service
from backend.mcp.models import MCPServer, MCPServerCreate, MCPServerUpdate
from backend.settings.service import get_or_create_org_settings

logger = structlog.get_logger()


def create_mcp_server(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    data: MCPServerCreate,
    created_by_id: uuid.UUID,
) -> MCPServer:
    """Create a new MCP server registration.

    Args:
        session: Database session
        organization_id: Organization ID (required)
        team_id: Team ID (optional, for team-level servers)
        user_id: User ID (optional, for user-level servers - requires team_id)
        data: Server creation data
        created_by_id: User ID who is creating the server

    Returns:
        Created MCPServer instance
    """
    # Create the server first to get the ID
    server = MCPServer(
        organization_id=organization_id,
        team_id=team_id,
        user_id=user_id,
        name=data.name,
        description=data.description,
        url=data.url,
        transport=data.transport.value,
        auth_type=data.auth_type.value,
        auth_header_name=data.auth_header_name,
        auth_secret_ref=None,
        enabled=data.enabled,
        tool_prefix=data.tool_prefix,
        is_builtin=False,
        created_by_id=created_by_id,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    session.add(server)
    session.commit()
    session.refresh(server)

    # Store auth secret in Infisical if provided
    if data.auth_secret:
        secrets = get_secrets_service()
        secret_ref = secrets.set_mcp_auth_secret(
            server_id=str(server.id),
            auth_secret=data.auth_secret,
            org_id=str(organization_id),
            team_id=str(team_id) if team_id else None,
            user_id=str(user_id) if user_id else None,
        )
        if secret_ref:
            server.auth_secret_ref = secret_ref
            session.add(server)
            session.commit()
            session.refresh(server)
        else:
            logger.warning(
                "mcp_auth_secret_storage_failed",
                server_id=str(server.id),
                message="Auth secret was provided but could not be stored in Infisical",
            )

    return server


def list_mcp_servers(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    include_org_level: bool = True,
    include_team_level: bool = True,
    include_user_level: bool = True,
) -> list[MCPServer]:
    """List MCP servers for a given scope.

    Args:
        session: Database session
        organization_id: Organization ID
        team_id: Team ID (optional)
        user_id: User ID (optional)
        include_org_level: Include org-level servers
        include_team_level: Include team-level servers
        include_user_level: Include user-level servers

    Returns:
        List of MCPServer instances
    """
    conditions = []

    # Always filter by organization
    base_condition = MCPServer.organization_id == organization_id

    if include_org_level:
        # Org-level: team_id IS NULL AND user_id IS NULL
        conditions.append((MCPServer.team_id.is_(None)) & (MCPServer.user_id.is_(None)))  # type: ignore[union-attr]

    if include_team_level and team_id:
        # Team-level: team_id matches AND user_id IS NULL
        conditions.append(
            (MCPServer.team_id == team_id) & (MCPServer.user_id.is_(None))  # type: ignore[union-attr]
        )

    if include_user_level and team_id and user_id:
        # User-level: team_id matches AND user_id matches
        conditions.append(
            (MCPServer.team_id == team_id) & (MCPServer.user_id == user_id)
        )

    if not conditions:
        return []

    statement = (
        select(MCPServer)
        .where(base_condition)
        .where(or_(*conditions))
        .order_by(MCPServer.created_at.desc())  # type: ignore[attr-defined]
    )

    return list(session.exec(statement).all())


def list_org_level_servers(
    session: Session,
    organization_id: uuid.UUID,
) -> list[MCPServer]:
    """List only organization-level MCP servers."""
    statement = (
        select(MCPServer)
        .where(MCPServer.organization_id == organization_id)
        .where(MCPServer.team_id.is_(None))  # type: ignore[union-attr]
        .where(MCPServer.user_id.is_(None))  # type: ignore[union-attr]
        .order_by(MCPServer.created_at.desc())  # type: ignore[attr-defined]
    )
    return list(session.exec(statement).all())


def list_team_level_servers(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
) -> list[MCPServer]:
    """List only team-level MCP servers (not including org-level)."""
    statement = (
        select(MCPServer)
        .where(MCPServer.organization_id == organization_id)
        .where(MCPServer.team_id == team_id)
        .where(MCPServer.user_id.is_(None))  # type: ignore[union-attr]
        .order_by(MCPServer.created_at.desc())  # type: ignore[attr-defined]
    )
    return list(session.exec(statement).all())


def list_user_level_servers(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[MCPServer]:
    """List only user-level MCP servers (not including org or team level)."""
    statement = (
        select(MCPServer)
        .where(MCPServer.organization_id == organization_id)
        .where(MCPServer.team_id == team_id)
        .where(MCPServer.user_id == user_id)
        .order_by(MCPServer.created_at.desc())  # type: ignore[attr-defined]
    )
    return list(session.exec(statement).all())


def get_mcp_server(
    session: Session,
    server_id: uuid.UUID,
) -> MCPServer | None:
    """Get a single MCP server by ID."""
    return session.get(MCPServer, server_id)


def update_mcp_server(
    session: Session,
    server_id: uuid.UUID,
    data: MCPServerUpdate,
) -> MCPServer | None:
    """Update an MCP server.

    Args:
        session: Database session
        server_id: Server ID to update
        data: Update data

    Returns:
        Updated MCPServer or None if not found
    """
    server = session.get(MCPServer, server_id)
    if not server:
        return None

    # Handle auth secret update if provided
    if data.auth_secret is not None:
        secrets = get_secrets_service()
        if data.auth_secret:
            # Store new secret
            secret_ref = secrets.set_mcp_auth_secret(
                server_id=str(server.id),
                auth_secret=data.auth_secret,
                org_id=str(server.organization_id),
                team_id=str(server.team_id) if server.team_id else None,
                user_id=str(server.user_id) if server.user_id else None,
            )
            if secret_ref:
                server.auth_secret_ref = secret_ref
            else:
                logger.warning(
                    "mcp_auth_secret_update_failed",
                    server_id=str(server.id),
                )
        else:
            # Empty string = clear the secret
            if server.auth_secret_ref:
                secrets.delete_mcp_auth_secret(
                    server_id=str(server.id),
                    org_id=str(server.organization_id),
                    team_id=str(server.team_id) if server.team_id else None,
                    user_id=str(server.user_id) if server.user_id else None,
                )
            server.auth_secret_ref = None

    update_data = data.model_dump(exclude_unset=True, exclude={"auth_secret"})
    for key, value in update_data.items():
        # Handle enum values
        if key in ("transport", "auth_type") and value is not None:
            value = value.value if hasattr(value, "value") else value
        setattr(server, key, value)

    server.updated_at = datetime.now(UTC)
    session.add(server)
    session.commit()
    session.refresh(server)
    return server


def delete_mcp_server(
    session: Session,
    server_id: uuid.UUID,
) -> bool:
    """Delete an MCP server.

    Also deletes any associated auth secret from Infisical.

    Args:
        session: Database session
        server_id: Server ID to delete

    Returns:
        True if deleted, False if not found
    """
    server = session.get(MCPServer, server_id)
    if not server:
        return False

    # Delete auth secret from Infisical if it exists
    if server.auth_secret_ref:
        secrets = get_secrets_service()
        secrets.delete_mcp_auth_secret(
            server_id=str(server.id),
            org_id=str(server.organization_id),
            team_id=str(server.team_id) if server.team_id else None,
            user_id=str(server.user_id) if server.user_id else None,
        )

    session.delete(server)
    session.commit()
    return True


def get_effective_mcp_servers(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID | None,
    user_id: uuid.UUID,
) -> list[MCPServer]:
    """Get all effective MCP servers for a user context.

    This returns all servers the user can access based on:
    1. Org-level servers (always included if enabled)
    2. Team-level servers (if team_id provided)
    3. User-level servers (personal servers)

    Only returns enabled servers.

    Args:
        session: Database session
        organization_id: Organization ID
        team_id: Team ID (optional)
        user_id: User ID

    Returns:
        List of enabled MCPServer instances the user can access
    """
    servers = list_mcp_servers(
        session=session,
        organization_id=organization_id,
        team_id=team_id,
        user_id=user_id,
        include_org_level=True,
        include_team_level=True,
        include_user_level=True,
    )

    # Filter to only enabled servers
    return [s for s in servers if s.enabled]


def count_team_servers(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
) -> int:
    """Count team-level servers (for enforcing limits)."""
    return len(list_team_level_servers(session, organization_id, team_id))


def count_user_servers(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
) -> int:
    """Count user-level servers (for enforcing limits)."""
    return len(list_user_level_servers(session, organization_id, team_id, user_id))


def check_server_limits(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
) -> tuple[bool, str | None]:
    """Check if adding a new server would exceed limits.

    Returns:
        Tuple of (allowed, error_message)
    """
    org_settings = get_or_create_org_settings(session, organization_id)

    if team_id and user_id:
        # User-level server
        current_count = count_user_servers(session, organization_id, team_id, user_id)
        if current_count >= org_settings.mcp_max_servers_per_user:
            return (
                False,
                f"Maximum of {org_settings.mcp_max_servers_per_user} personal MCP servers allowed",
            )
    elif team_id:
        # Team-level server
        current_count = count_team_servers(session, organization_id, team_id)
        if current_count >= org_settings.mcp_max_servers_per_team:
            return (
                False,
                f"Maximum of {org_settings.mcp_max_servers_per_team} team MCP servers allowed",
            )

    return True, None
