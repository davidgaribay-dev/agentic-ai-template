from typing import TYPE_CHECKING
import uuid

from sqlalchemy.dialects.postgresql import JSON
from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import TimestampedTable, TimestampResponseMixin

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.organizations.models import Organization
    from backend.teams.models import Team


class ChatSettingsBase(SQLModel):
    """Base settings for chat feature visibility.

    Toggles:
    - chat_enabled: Controls sidebar chat section and standalone chat page
    - chat_panel_enabled: Controls the right-side chat panel
    - memory_enabled: Controls persistent memory across conversations
    - mcp_enabled: Controls MCP (Model Context Protocol) tool integration

    Tool configuration:
    - disabled_mcp_servers: List of MCP server UUIDs to disable
    - disabled_tools: List of tool names to disable (format: server__tool)

    Higher-level settings take precedence: Organization > Team > User.
    """

    chat_enabled: bool = Field(default=True)
    chat_panel_enabled: bool = Field(default=True)
    memory_enabled: bool = Field(default=True)
    mcp_enabled: bool = Field(default=True)
    mcp_tool_approval_required: bool = Field(default=True)
    disabled_mcp_servers: list[str] = Field(default_factory=list, sa_type=JSON)
    disabled_tools: list[str] = Field(default_factory=list, sa_type=JSON)


class OrganizationSettings(ChatSettingsBase, TimestampedTable, table=True):
    """Organization-level chat visibility settings.

    These settings are the master controls. If disabled at org level,
    teams and users cannot enable the feature.
    """

    __tablename__ = "organization_settings"

    # Scoping with unique constraint (one settings record per org)
    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    # MCP-specific org settings
    mcp_allow_custom_servers: bool = Field(default=True)
    mcp_max_servers_per_team: int = Field(default=10)
    mcp_max_servers_per_user: int = Field(default=5)

    organization: "Organization" = Relationship(back_populates="settings")


class OrganizationSettingsUpdate(SQLModel):
    chat_enabled: bool | None = None
    chat_panel_enabled: bool | None = None
    memory_enabled: bool | None = None
    mcp_enabled: bool | None = None
    mcp_tool_approval_required: bool | None = None
    mcp_allow_custom_servers: bool | None = None
    mcp_max_servers_per_team: int | None = None
    mcp_max_servers_per_user: int | None = None
    disabled_mcp_servers: list[str] | None = None
    disabled_tools: list[str] | None = None


class OrganizationSettingsPublic(ChatSettingsBase, TimestampResponseMixin):
    id: uuid.UUID
    organization_id: uuid.UUID
    mcp_allow_custom_servers: bool
    mcp_max_servers_per_team: int
    mcp_max_servers_per_user: int


class TeamSettings(ChatSettingsBase, TimestampedTable, table=True):
    """Team-level chat visibility settings.

    Can only enable features that the org has enabled.
    Overrides user settings for team members.
    """

    __tablename__ = "team_settings"

    # Scoping with unique constraint (one settings record per team)
    team_id: uuid.UUID = Field(
        foreign_key="team.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    # MCP-specific team settings
    mcp_allow_custom_servers: bool = Field(default=True)

    team: "Team" = Relationship(back_populates="settings")


class TeamSettingsUpdate(SQLModel):
    chat_enabled: bool | None = None
    chat_panel_enabled: bool | None = None
    memory_enabled: bool | None = None
    mcp_enabled: bool | None = None
    mcp_tool_approval_required: bool | None = None
    mcp_allow_custom_servers: bool | None = None
    disabled_mcp_servers: list[str] | None = None
    disabled_tools: list[str] | None = None


class TeamSettingsPublic(ChatSettingsBase, TimestampResponseMixin):
    id: uuid.UUID
    team_id: uuid.UUID
    mcp_allow_custom_servers: bool


class UserSettings(ChatSettingsBase, TimestampedTable, table=True):
    """User-level chat visibility preferences.

    Can only enable features that both org and team have enabled.
    These are personal preferences for the user.
    """

    __tablename__ = "user_settings"

    # Scoping with unique constraint (one settings record per user)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    user: "User" = Relationship(back_populates="settings")


class UserSettingsUpdate(SQLModel):
    chat_enabled: bool | None = None
    chat_panel_enabled: bool | None = None
    memory_enabled: bool | None = None
    mcp_enabled: bool | None = None
    mcp_tool_approval_required: bool | None = None
    disabled_mcp_servers: list[str] | None = None
    disabled_tools: list[str] | None = None


class UserSettingsPublic(ChatSettingsBase, TimestampResponseMixin):
    id: uuid.UUID
    user_id: uuid.UUID


class EffectiveSettings(SQLModel):
    """Computed effective settings after applying hierarchy.

    Includes both the final enabled/disabled state and information
    about which level disabled each feature.

    For disabled_mcp_servers and disabled_tools, values from all
    hierarchy levels are merged (union) since disabling at any
    level should take effect.
    """

    chat_enabled: bool
    chat_disabled_by: str | None = None
    chat_panel_enabled: bool
    chat_panel_disabled_by: str | None = None
    memory_enabled: bool
    memory_disabled_by: str | None = None
    mcp_enabled: bool
    mcp_disabled_by: str | None = None
    mcp_tool_approval_required: bool
    mcp_tool_approval_required_by: str | None = None
    mcp_allow_custom_servers: bool
    mcp_custom_servers_disabled_by: str | None = None
    disabled_mcp_servers: list[str] = []
    disabled_tools: list[str] = []


OrganizationSettings.model_rebuild()
TeamSettings.model_rebuild()
UserSettings.model_rebuild()
