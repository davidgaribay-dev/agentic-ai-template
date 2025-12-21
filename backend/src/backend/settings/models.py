import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

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

    Higher-level settings take precedence: Organization > Team > User.
    """

    chat_enabled: bool = Field(default=True)
    chat_panel_enabled: bool = Field(default=True)
    memory_enabled: bool = Field(default=True)
    mcp_enabled: bool = Field(default=True)
    mcp_tool_approval_required: bool = Field(default=True)


class OrganizationSettings(ChatSettingsBase, table=True):
    """Organization-level chat visibility settings.

    These settings are the master controls. If disabled at org level,
    teams and users cannot enable the feature.
    """

    __tablename__ = "organization_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    # MCP-specific org settings
    mcp_allow_custom_servers: bool = Field(default=True)
    mcp_max_servers_per_team: int = Field(default=10)
    mcp_max_servers_per_user: int = Field(default=5)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

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


class OrganizationSettingsPublic(ChatSettingsBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    mcp_allow_custom_servers: bool
    mcp_max_servers_per_team: int
    mcp_max_servers_per_user: int
    created_at: datetime
    updated_at: datetime


class TeamSettings(ChatSettingsBase, table=True):
    """Team-level chat visibility settings.

    Can only enable features that the org has enabled.
    Overrides user settings for team members.
    """

    __tablename__ = "team_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    team_id: uuid.UUID = Field(
        foreign_key="team.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    # MCP-specific team settings
    mcp_allow_custom_servers: bool = Field(default=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    team: "Team" = Relationship(back_populates="settings")


class TeamSettingsUpdate(SQLModel):
    chat_enabled: bool | None = None
    chat_panel_enabled: bool | None = None
    memory_enabled: bool | None = None
    mcp_enabled: bool | None = None
    mcp_tool_approval_required: bool | None = None
    mcp_allow_custom_servers: bool | None = None


class TeamSettingsPublic(ChatSettingsBase):
    id: uuid.UUID
    team_id: uuid.UUID
    mcp_allow_custom_servers: bool
    created_at: datetime
    updated_at: datetime


class UserSettings(ChatSettingsBase, table=True):
    """User-level chat visibility preferences.

    Can only enable features that both org and team have enabled.
    These are personal preferences for the user.
    """

    __tablename__ = "user_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, nullable=False, ondelete="CASCADE"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    user: "User" = Relationship(back_populates="settings")


class UserSettingsUpdate(SQLModel):
    chat_enabled: bool | None = None
    chat_panel_enabled: bool | None = None
    memory_enabled: bool | None = None
    mcp_enabled: bool | None = None
    mcp_tool_approval_required: bool | None = None


class UserSettingsPublic(ChatSettingsBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class EffectiveSettings(SQLModel):
    """Computed effective settings after applying hierarchy.

    Includes both the final enabled/disabled state and information
    about which level disabled each feature.
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


from backend.auth.models import User  # noqa: E402, F401
from backend.organizations.models import Organization  # noqa: E402, F401
from backend.teams.models import Team  # noqa: E402, F401

OrganizationSettings.model_rebuild()
TeamSettings.model_rebuild()
UserSettings.model_rebuild()
