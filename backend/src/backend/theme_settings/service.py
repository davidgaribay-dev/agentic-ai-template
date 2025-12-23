from datetime import UTC, datetime
import uuid

from sqlmodel import Session, select

from backend.theme_settings.models import (
    EffectiveThemeSettings,
    OrganizationThemeSettings,
    OrganizationThemeSettingsUpdate,
    TeamThemeSettings,
    TeamThemeSettingsUpdate,
    UserThemeSettings,
    UserThemeSettingsUpdate,
)
from backend.theme_settings.themes import get_theme_colors


def get_or_create_org_theme_settings(
    session: Session, organization_id: uuid.UUID
) -> OrganizationThemeSettings:
    """Get or create organization theme settings with defaults."""
    statement = select(OrganizationThemeSettings).where(
        OrganizationThemeSettings.organization_id == organization_id
    )
    settings = session.exec(statement).first()

    if not settings:
        settings = OrganizationThemeSettings(
            organization_id=organization_id,
            theme_customization_enabled=True,
            allow_team_customization=True,
            allow_user_customization=True,
            default_theme_mode="system",
            default_light_theme="github-light",
            default_dark_theme="one-dark-pro",
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_org_theme_settings(
    session: Session,
    organization_id: uuid.UUID,
    data: OrganizationThemeSettingsUpdate,
) -> OrganizationThemeSettings:
    """Update organization theme settings."""
    settings = get_or_create_org_theme_settings(session, organization_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_team_theme_settings(
    session: Session, team_id: uuid.UUID
) -> TeamThemeSettings:
    """Get or create team theme settings with defaults."""
    statement = select(TeamThemeSettings).where(TeamThemeSettings.team_id == team_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = TeamThemeSettings(
            team_id=team_id,
            theme_customization_enabled=True,
            allow_user_customization=True,
            default_theme_mode="system",
            default_light_theme="github-light",
            default_dark_theme="one-dark-pro",
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_team_theme_settings(
    session: Session, team_id: uuid.UUID, data: TeamThemeSettingsUpdate
) -> TeamThemeSettings:
    """Update team theme settings."""
    settings = get_or_create_team_theme_settings(session, team_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_user_theme_settings(
    session: Session, user_id: uuid.UUID
) -> UserThemeSettings:
    """Get or create user theme settings with defaults."""
    statement = select(UserThemeSettings).where(UserThemeSettings.user_id == user_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = UserThemeSettings(
            user_id=user_id,
            theme_mode="system",
            light_theme="github-light",
            dark_theme="one-dark-pro",
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_user_theme_settings(
    session: Session, user_id: uuid.UUID, data: UserThemeSettingsUpdate
) -> UserThemeSettings:
    """Update user theme settings."""
    settings = get_or_create_user_theme_settings(session, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_effective_theme_settings(
    session: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    team_id: uuid.UUID | None = None,
    system_prefers_dark: bool = False,
) -> EffectiveThemeSettings:
    """Compute effective theme settings by applying hierarchy: Org > Team > User.

    The hierarchy works as follows:
    1. Check org permissions first (if disabled, block all customization)
    2. Check team permissions (if org allows but team disables, block user customization)
    3. Apply user preferences (if allowed)
    4. Return effective theme with resolved colors

    Args:
        session: Database session
        user_id: User UUID
        organization_id: Organization UUID
        team_id: Optional team UUID (for team context)
        system_prefers_dark: Whether system/browser prefers dark mode (for "system" theme mode)

    Returns:
        EffectiveThemeSettings with computed values and permission metadata
    """
    org_settings = get_or_create_org_theme_settings(session, organization_id)
    team_settings = None
    if team_id:
        team_settings = get_or_create_team_theme_settings(session, team_id)
    user_settings = get_or_create_user_theme_settings(session, user_id)

    # Step 1: Check if org allows any customization
    if not org_settings.theme_customization_enabled:
        # Org disabled all customization - use org defaults
        return _build_effective_settings(
            org_settings.default_theme_mode,
            org_settings.default_light_theme,
            org_settings.default_dark_theme,
            org_settings.custom_light_theme,
            org_settings.custom_dark_theme,
            customization_allowed=False,
            customization_disabled_by="org",
            system_prefers_dark=system_prefers_dark,
        )

    # Step 2: Check team customization (if in team context)
    if team_settings:
        # Check if org allows team customization
        if not org_settings.allow_team_customization:
            # Org blocks team customization, check if user can customize
            if org_settings.allow_user_customization:
                # User can customize - use user settings
                return _build_effective_settings(
                    user_settings.theme_mode,
                    user_settings.light_theme,
                    user_settings.dark_theme,
                    user_settings.custom_light_theme,
                    user_settings.custom_dark_theme,
                    customization_allowed=True,
                    customization_disabled_by=None,
                    system_prefers_dark=system_prefers_dark,
                )
            # User cannot customize - use org defaults
            return _build_effective_settings(
                org_settings.default_theme_mode,
                org_settings.default_light_theme,
                org_settings.default_dark_theme,
                org_settings.custom_light_theme,
                org_settings.custom_dark_theme,
                customization_allowed=False,
                customization_disabled_by="org",
                system_prefers_dark=system_prefers_dark,
            )

        # Org allows team customization - check if team is using it
        if not team_settings.theme_customization_enabled:
            # Team not using custom themes, check if user can customize
            user_can_customize = (
                team_settings.allow_user_customization
                and org_settings.allow_user_customization
            )
            if user_can_customize:
                # User can customize - use user settings
                return _build_effective_settings(
                    user_settings.theme_mode,
                    user_settings.light_theme,
                    user_settings.dark_theme,
                    user_settings.custom_light_theme,
                    user_settings.custom_dark_theme,
                    customization_allowed=True,
                    customization_disabled_by=None,
                    system_prefers_dark=system_prefers_dark,
                )
            # User cannot customize - use org defaults
            disabled_by = "org" if not org_settings.allow_user_customization else "team"
            return _build_effective_settings(
                org_settings.default_theme_mode,
                org_settings.default_light_theme,
                org_settings.default_dark_theme,
                org_settings.custom_light_theme,
                org_settings.custom_dark_theme,
                customization_allowed=False,
                customization_disabled_by=disabled_by,
                system_prefers_dark=system_prefers_dark,
            )

        # Team is using custom themes - check if user can override
        user_can_customize = (
            team_settings.allow_user_customization
            and org_settings.allow_user_customization
        )
        if user_can_customize:
            # User can override - use user settings
            return _build_effective_settings(
                user_settings.theme_mode,
                user_settings.light_theme,
                user_settings.dark_theme,
                user_settings.custom_light_theme,
                user_settings.custom_dark_theme,
                customization_allowed=True,
                customization_disabled_by=None,
                system_prefers_dark=system_prefers_dark,
            )
        # User cannot override - use team defaults
        disabled_by = "org" if not org_settings.allow_user_customization else "team"
        return _build_effective_settings(
            team_settings.default_theme_mode,
            team_settings.default_light_theme,
            team_settings.default_dark_theme,
            team_settings.custom_light_theme,
            team_settings.custom_dark_theme,
            customization_allowed=False,
            customization_disabled_by=disabled_by,
            system_prefers_dark=system_prefers_dark,
        )

    # Step 3: No team context - check if user can customize
    if org_settings.allow_user_customization:
        # User can customize - use user settings
        return _build_effective_settings(
            user_settings.theme_mode,
            user_settings.light_theme,
            user_settings.dark_theme,
            user_settings.custom_light_theme,
            user_settings.custom_dark_theme,
            customization_allowed=True,
            customization_disabled_by=None,
            system_prefers_dark=system_prefers_dark,
        )
    # User cannot customize - use org defaults
    return _build_effective_settings(
        org_settings.default_theme_mode,
        org_settings.default_light_theme,
        org_settings.default_dark_theme,
        org_settings.custom_light_theme,
        org_settings.custom_dark_theme,
        customization_allowed=False,
        customization_disabled_by="org",
        system_prefers_dark=system_prefers_dark,
    )


def _build_effective_settings(
    theme_mode: str,
    light_theme: str,
    dark_theme: str,
    custom_light_theme: dict | None,
    custom_dark_theme: dict | None,
    customization_allowed: bool,
    customization_disabled_by: str | None,
    system_prefers_dark: bool,
) -> EffectiveThemeSettings:
    """Build EffectiveThemeSettings with resolved theme colors.

    Args:
        theme_mode: "light", "dark", or "system"
        light_theme: Theme ID for light mode
        dark_theme: Theme ID for dark mode
        custom_light_theme: Custom colors for light mode (optional)
        custom_dark_theme: Custom colors for dark mode (optional)
        customization_allowed: Whether user can customize themes
        customization_disabled_by: Who disabled customization ("org", "team", or None)
        system_prefers_dark: Whether system/browser prefers dark mode

    Returns:
        EffectiveThemeSettings with resolved active_theme_colors
    """
    # Determine active mode
    if theme_mode == "system":
        active_mode = "dark" if system_prefers_dark else "light"
    else:
        active_mode = theme_mode

    # Get colors for active mode
    if active_mode == "light":
        theme_id = light_theme
        custom_colors = custom_light_theme
    else:
        theme_id = dark_theme
        custom_colors = custom_dark_theme

    # Resolve colors (custom takes precedence over predefined)
    active_theme_colors = custom_colors or get_theme_colors(theme_id)

    return EffectiveThemeSettings(
        theme_mode=theme_mode,
        light_theme=light_theme,
        dark_theme=dark_theme,
        custom_light_theme=custom_light_theme,
        custom_dark_theme=custom_dark_theme,
        customization_allowed=customization_allowed,
        customization_disabled_by=customization_disabled_by,
        active_theme_colors=active_theme_colors,
    )
