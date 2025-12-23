from typing import TYPE_CHECKING
import uuid

from sqlalchemy.dialects.postgresql import JSON
from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import TimestampedTable, TimestampResponseMixin

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.organizations.models import Organization
    from backend.teams.models import Team


class ThemeColors(SQLModel):
    """OKLch color values for a theme.

    All colors use OKLch color space for perceptual uniformity.
    Format: oklch(lightness saturation hue)
    """

    background: str
    foreground: str
    chat_input_bg: str
    card: str
    card_foreground: str
    popover: str
    popover_foreground: str
    primary: str
    primary_foreground: str
    secondary: str
    secondary_foreground: str
    muted: str
    muted_foreground: str
    accent: str
    accent_foreground: str
    destructive: str
    destructive_foreground: str
    border: str
    input: str
    ring: str
    chart_1: str
    chart_2: str
    chart_3: str
    chart_4: str
    chart_5: str
    sidebar: str
    sidebar_foreground: str
    sidebar_primary: str
    sidebar_primary_foreground: str
    sidebar_accent: str
    sidebar_accent_foreground: str
    sidebar_border: str
    sidebar_ring: str


class ThemeSettingsBase(SQLModel):
    """Base theme settings shared across all hierarchy levels.

    Theme mode options:
    - "light": Always use light theme
    - "dark": Always use dark theme
    - "system": Follow OS/browser preference

    For each mode, separate theme can be configured:
    - default_light_theme: Theme to use in light mode (predefined or custom)
    - default_dark_theme: Theme to use in dark mode (predefined or custom)
    - custom_light_theme: Custom OKLch color values for light mode
    - custom_dark_theme: Custom OKLch color values for dark mode
    """

    default_theme_mode: str = Field(default="system")  # "light" | "dark" | "system"
    default_light_theme: str = Field(default="github-light")
    default_dark_theme: str = Field(default="one-dark-pro")
    custom_light_theme: dict | None = Field(default=None, sa_type=JSON)
    custom_dark_theme: dict | None = Field(default=None, sa_type=JSON)


class OrganizationThemeSettings(ThemeSettingsBase, TimestampedTable, table=True):
    """Organization-level theme settings.

    Controls theme customization permissions for the entire organization:
    - theme_customization_enabled: Master toggle for theming
    - allow_team_customization: Whether teams can override org defaults
    - allow_user_customization: Whether users can override org/team defaults

    If customization is disabled at org level, teams and users must use
    the org's default themes.
    """

    __tablename__ = "organization_theme_settings"

    # Scoping with unique constraint (one settings record per org)
    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    # Org-specific permissions
    theme_customization_enabled: bool = Field(default=True)
    allow_team_customization: bool = Field(default=True)
    allow_user_customization: bool = Field(default=True)

    organization: "Organization" = Relationship(back_populates="theme_settings")


class OrganizationThemeSettingsUpdate(SQLModel):
    theme_customization_enabled: bool | None = None
    allow_team_customization: bool | None = None
    allow_user_customization: bool | None = None
    default_theme_mode: str | None = None
    default_light_theme: str | None = None
    default_dark_theme: str | None = None
    custom_light_theme: dict | None = None
    custom_dark_theme: dict | None = None


class OrganizationThemeSettingsPublic(ThemeSettingsBase, TimestampResponseMixin):
    id: uuid.UUID
    organization_id: uuid.UUID
    theme_customization_enabled: bool
    allow_team_customization: bool
    allow_user_customization: bool


class TeamThemeSettings(ThemeSettingsBase, TimestampedTable, table=True):
    """Team-level theme settings.

    Can only customize themes if org allows team customization.
    Controls whether team members can override team defaults:
    - theme_customization_enabled: Whether this team uses custom themes
    - allow_user_customization: Whether team members can customize

    Team settings override org settings for team members.
    """

    __tablename__ = "team_theme_settings"

    # Scoping with unique constraint (one settings record per team)
    team_id: uuid.UUID = Field(
        foreign_key="team.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    # Team-specific permissions
    theme_customization_enabled: bool = Field(default=True)
    allow_user_customization: bool = Field(default=True)

    team: "Team" = Relationship(back_populates="theme_settings")


class TeamThemeSettingsUpdate(SQLModel):
    theme_customization_enabled: bool | None = None
    allow_user_customization: bool | None = None
    default_theme_mode: str | None = None
    default_light_theme: str | None = None
    default_dark_theme: str | None = None
    custom_light_theme: dict | None = None
    custom_dark_theme: dict | None = None


class TeamThemeSettingsPublic(ThemeSettingsBase, TimestampResponseMixin):
    id: uuid.UUID
    team_id: uuid.UUID
    theme_customization_enabled: bool
    allow_user_customization: bool


class UserThemeSettings(TimestampedTable, table=True):
    """User-level theme preferences.

    Personal theme preferences that apply when both org and team
    allow user customization.

    Users can choose:
    - theme_mode: "light", "dark", or "system"
    - light_theme: Theme to use in light mode
    - dark_theme: Theme to use in dark mode
    - custom_light_theme: Custom colors for light mode
    - custom_dark_theme: Custom colors for dark mode
    """

    __tablename__ = "user_theme_settings"

    # Scoping with unique constraint (one settings record per user)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", unique=True, nullable=False, ondelete="CASCADE"
    )

    # User preferences
    theme_mode: str = Field(default="system")
    light_theme: str = Field(default="github-light")
    dark_theme: str = Field(default="one-dark-pro")
    custom_light_theme: dict | None = Field(default=None, sa_type=JSON)
    custom_dark_theme: dict | None = Field(default=None, sa_type=JSON)

    user: "User" = Relationship(back_populates="theme_settings")


class UserThemeSettingsUpdate(SQLModel):
    theme_mode: str | None = None
    light_theme: str | None = None
    dark_theme: str | None = None
    custom_light_theme: dict | None = None
    custom_dark_theme: dict | None = None


class UserThemeSettingsPublic(TimestampResponseMixin):
    id: uuid.UUID
    user_id: uuid.UUID
    theme_mode: str
    light_theme: str
    dark_theme: str
    custom_light_theme: dict | None
    custom_dark_theme: dict | None


class EffectiveThemeSettings(SQLModel):
    """Computed effective theme settings after applying hierarchy.

    Resolution order: User > Team > Org

    Includes:
    - Final theme mode and theme selections
    - Permission metadata (who disabled customization)
    - Resolved theme colors based on current mode and system preference
    """

    theme_mode: str
    light_theme: str
    dark_theme: str
    custom_light_theme: dict | None
    custom_dark_theme: dict | None

    # Metadata about permissions
    customization_allowed: bool
    customization_disabled_by: str | None = None  # "org" | "team" | None

    # Resolved theme colors (based on current mode + system preference)
    active_theme_colors: dict  # Full OKLch color map


OrganizationThemeSettings.model_rebuild()
TeamThemeSettings.model_rebuild()
UserThemeSettings.model_rebuild()
