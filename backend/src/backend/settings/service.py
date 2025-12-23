from datetime import UTC, datetime
import uuid

from sqlmodel import Session, select

from backend.settings.models import (
    EffectiveSettings,
    OrganizationSettings,
    OrganizationSettingsUpdate,
    TeamSettings,
    TeamSettingsUpdate,
    UserSettings,
    UserSettingsUpdate,
)


def get_or_create_org_settings(
    session: Session, organization_id: uuid.UUID
) -> OrganizationSettings:
    statement = select(OrganizationSettings).where(
        OrganizationSettings.organization_id == organization_id
    )
    settings = session.exec(statement).first()

    if not settings:
        settings = OrganizationSettings(
            organization_id=organization_id,
            chat_enabled=True,
            chat_panel_enabled=True,
            memory_enabled=False,  # Disabled by default - requires OpenAI embeddings
            mcp_enabled=True,
            mcp_tool_approval_required=True,
            mcp_allow_custom_servers=True,
            mcp_max_servers_per_team=10,
            mcp_max_servers_per_user=5,
            max_media_file_size_mb=10,
            max_media_per_message=5,
            max_media_storage_mb=None,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_org_settings(
    session: Session, organization_id: uuid.UUID, data: OrganizationSettingsUpdate
) -> OrganizationSettings:
    settings = get_or_create_org_settings(session, organization_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_team_settings(session: Session, team_id: uuid.UUID) -> TeamSettings:
    statement = select(TeamSettings).where(TeamSettings.team_id == team_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = TeamSettings(
            team_id=team_id,
            chat_enabled=True,
            chat_panel_enabled=True,
            memory_enabled=False,  # Disabled by default - requires OpenAI embeddings
            mcp_enabled=True,
            mcp_tool_approval_required=True,
            mcp_allow_custom_servers=True,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_team_settings(
    session: Session, team_id: uuid.UUID, data: TeamSettingsUpdate
) -> TeamSettings:
    settings = get_or_create_team_settings(session, team_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_user_settings(session: Session, user_id: uuid.UUID) -> UserSettings:
    statement = select(UserSettings).where(UserSettings.user_id == user_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = UserSettings(
            user_id=user_id,
            chat_enabled=True,
            chat_panel_enabled=True,
            memory_enabled=True,
            mcp_enabled=True,
            mcp_tool_approval_required=True,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_user_settings(
    session: Session, user_id: uuid.UUID, data: UserSettingsUpdate
) -> UserSettings:
    settings = get_or_create_user_settings(session, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_effective_settings(
    session: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> EffectiveSettings:
    """Compute effective settings by applying hierarchy: Org > Team > User.

    The hierarchy works as follows:
    - If org disables a feature, it's disabled regardless of team/user settings
    - If team disables a feature (and org allows), it's disabled for team members
    - User settings only apply if both org and team allow the feature
    """
    org_settings = None
    team_settings = None
    user_settings = get_or_create_user_settings(session, user_id)

    if organization_id:
        org_settings = get_or_create_org_settings(session, organization_id)
    if team_id:
        team_settings = get_or_create_team_settings(session, team_id)

    # Chat enabled (sidebar + standalone chat page)
    chat_enabled = True
    chat_disabled_by = None

    if org_settings and not org_settings.chat_enabled:
        chat_enabled = False
        chat_disabled_by = "org"
    elif team_settings and not team_settings.chat_enabled:
        chat_enabled = False
        chat_disabled_by = "team"
    elif not user_settings.chat_enabled:
        chat_enabled = False

    # Chat panel enabled
    chat_panel_enabled = True
    chat_panel_disabled_by = None

    if org_settings and not org_settings.chat_panel_enabled:
        chat_panel_enabled = False
        chat_panel_disabled_by = "org"
    elif team_settings and not team_settings.chat_panel_enabled:
        chat_panel_enabled = False
        chat_panel_disabled_by = "team"
    elif not user_settings.chat_panel_enabled:
        chat_panel_enabled = False

    # Memory enabled
    memory_enabled = True
    memory_disabled_by = None

    if org_settings and not org_settings.memory_enabled:
        memory_enabled = False
        memory_disabled_by = "org"
    elif team_settings and not team_settings.memory_enabled:
        memory_enabled = False
        memory_disabled_by = "team"
    elif not user_settings.memory_enabled:
        memory_enabled = False

    # MCP enabled
    mcp_enabled = True
    mcp_disabled_by = None

    if org_settings and not org_settings.mcp_enabled:
        mcp_enabled = False
        mcp_disabled_by = "org"
    elif team_settings and not team_settings.mcp_enabled:
        mcp_enabled = False
        mcp_disabled_by = "team"
    elif not user_settings.mcp_enabled:
        mcp_enabled = False

    # MCP tool approval required (if ANY level requires it, it's required)
    mcp_tool_approval_required = False
    mcp_tool_approval_required_by = None

    if org_settings and org_settings.mcp_tool_approval_required:
        mcp_tool_approval_required = True
        mcp_tool_approval_required_by = "org"
    elif team_settings and team_settings.mcp_tool_approval_required:
        mcp_tool_approval_required = True
        mcp_tool_approval_required_by = "team"
    elif user_settings.mcp_tool_approval_required:
        mcp_tool_approval_required = True
        mcp_tool_approval_required_by = "user"

    # MCP custom servers allowed
    mcp_allow_custom_servers = True
    mcp_custom_servers_disabled_by = None

    if org_settings and not org_settings.mcp_allow_custom_servers:
        mcp_allow_custom_servers = False
        mcp_custom_servers_disabled_by = "org"
    elif team_settings and not team_settings.mcp_allow_custom_servers:
        mcp_allow_custom_servers = False
        mcp_custom_servers_disabled_by = "team"

    # Disabled MCP servers - merge from all hierarchy levels (union)
    # If a server is disabled at ANY level, it's disabled for the user
    disabled_mcp_servers: set[str] = set()
    if org_settings and org_settings.disabled_mcp_servers:
        disabled_mcp_servers.update(org_settings.disabled_mcp_servers)
    if team_settings and team_settings.disabled_mcp_servers:
        disabled_mcp_servers.update(team_settings.disabled_mcp_servers)
    if user_settings.disabled_mcp_servers:
        disabled_mcp_servers.update(user_settings.disabled_mcp_servers)

    # Disabled tools - merge from all hierarchy levels (union)
    # If a tool is disabled at ANY level, it's disabled for the user
    disabled_tools: set[str] = set()
    if org_settings and org_settings.disabled_tools:
        disabled_tools.update(org_settings.disabled_tools)
    if team_settings and team_settings.disabled_tools:
        disabled_tools.update(team_settings.disabled_tools)
    if user_settings.disabled_tools:
        disabled_tools.update(user_settings.disabled_tools)

    return EffectiveSettings(
        chat_enabled=chat_enabled,
        chat_disabled_by=chat_disabled_by,
        chat_panel_enabled=chat_panel_enabled,
        chat_panel_disabled_by=chat_panel_disabled_by,
        memory_enabled=memory_enabled,
        memory_disabled_by=memory_disabled_by,
        mcp_enabled=mcp_enabled,
        mcp_disabled_by=mcp_disabled_by,
        mcp_tool_approval_required=mcp_tool_approval_required,
        mcp_tool_approval_required_by=mcp_tool_approval_required_by,
        mcp_allow_custom_servers=mcp_allow_custom_servers,
        mcp_custom_servers_disabled_by=mcp_custom_servers_disabled_by,
        disabled_mcp_servers=list(disabled_mcp_servers),
        disabled_tools=list(disabled_tools),
    )
