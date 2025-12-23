import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request

from backend.audit import audit_service
from backend.audit.schemas import AuditAction, Target
from backend.auth.deps import CurrentUser, SessionDep
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    TeamContextDep,
    TeamPermission,
    require_org_permission,
    require_team_permission,
)
from backend.theme_settings import service
from backend.theme_settings.models import (
    EffectiveThemeSettings,
    OrganizationThemeSettingsPublic,
    OrganizationThemeSettingsUpdate,
    TeamThemeSettingsPublic,
    TeamThemeSettingsUpdate,
    UserThemeSettingsPublic,
    UserThemeSettingsUpdate,
)
from backend.theme_settings.themes import PREDEFINED_THEMES

router = APIRouter(tags=["theme-settings"])


@router.get(
    "/organizations/{organization_id}/theme-settings",
    response_model=OrganizationThemeSettingsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
def get_org_theme_settings(
    session: SessionDep,
    org_context: OrgContextDep,
) -> OrganizationThemeSettingsPublic:
    """Get organization theme settings.

    Requires org:read permission (member, admin, or owner).
    """
    settings = service.get_or_create_org_theme_settings(session, org_context.org_id)
    return OrganizationThemeSettingsPublic.model_validate(settings)


@router.put(
    "/organizations/{organization_id}/theme-settings",
    response_model=OrganizationThemeSettingsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def update_org_theme_settings(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    current_user: CurrentUser,
    settings_in: OrganizationThemeSettingsUpdate,
) -> OrganizationThemeSettingsPublic:
    """Update organization theme settings.

    Requires org:update permission (admin or owner).
    Controls theme customization for the entire organization.
    If theme_customization_enabled is false, teams and users must use org defaults.
    """
    # Get current settings for change tracking
    current_settings = service.get_or_create_org_theme_settings(
        session, org_context.org_id
    )
    changes = {}
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        old_value = getattr(current_settings, field, None)
        if old_value != new_value:
            changes[field] = {"before": old_value, "after": new_value}

    settings = service.update_org_theme_settings(
        session, org_context.org_id, settings_in
    )

    if changes:
        await audit_service.log(
            AuditAction.ORG_SETTINGS_UPDATED,
            actor=current_user,
            request=request,
            organization_id=org_context.org_id,
            targets=[Target(type="organization_theme_settings", id=str(org_context.org_id))],
            changes=changes,
        )

    return OrganizationThemeSettingsPublic.model_validate(settings)


@router.get(
    "/organizations/{organization_id}/teams/{team_id}/theme-settings",
    response_model=TeamThemeSettingsPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_READ))],
)
def get_team_theme_settings(
    session: SessionDep,
    team_context: TeamContextDep,
) -> TeamThemeSettingsPublic:
    """Get team theme settings.

    Requires team:read permission (team member, admin, or org admin).
    """
    settings = service.get_or_create_team_theme_settings(session, team_context.team_id)
    return TeamThemeSettingsPublic.model_validate(settings)


@router.put(
    "/organizations/{organization_id}/teams/{team_id}/theme-settings",
    response_model=TeamThemeSettingsPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def update_team_theme_settings(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    current_user: CurrentUser,
    settings_in: TeamThemeSettingsUpdate,
) -> TeamThemeSettingsPublic:
    """Update team theme settings.

    Requires team:update permission (team admin or org admin).
    Teams can only customize if org allows team customization.
    """
    # Get current settings for change tracking
    current_settings = service.get_or_create_team_theme_settings(
        session, team_context.team_id
    )
    changes = {}
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        old_value = getattr(current_settings, field, None)
        if old_value != new_value:
            changes[field] = {"before": old_value, "after": new_value}

    settings = service.update_team_theme_settings(
        session, team_context.team_id, settings_in
    )

    if changes:
        await audit_service.log(
            AuditAction.TEAM_SETTINGS_UPDATED,
            actor=current_user,
            request=request,
            organization_id=team_context.org_id,
            team_id=team_context.team_id,
            targets=[Target(type="team_theme_settings", id=str(team_context.team_id))],
            changes=changes,
        )

    return TeamThemeSettingsPublic.model_validate(settings)


@router.get(
    "/users/me/theme-settings",
    response_model=UserThemeSettingsPublic,
)
def get_user_theme_settings(
    session: SessionDep,
    current_user: CurrentUser,
) -> UserThemeSettingsPublic:
    """Get current user's theme settings.

    Personal theme preferences.
    """
    settings = service.get_or_create_user_theme_settings(session, current_user.id)
    return UserThemeSettingsPublic.model_validate(settings)


@router.put(
    "/users/me/theme-settings",
    response_model=UserThemeSettingsPublic,
)
async def update_user_theme_settings(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    settings_in: UserThemeSettingsUpdate,
) -> UserThemeSettingsPublic:
    """Update current user's theme settings.

    Personal theme preferences that apply when both org and team allow customization.
    """
    # Get current settings for change tracking
    current_settings = service.get_or_create_user_theme_settings(
        session, current_user.id
    )
    changes = {}
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        old_value = getattr(current_settings, field, None)
        if old_value != new_value:
            changes[field] = {"before": old_value, "after": new_value}

    settings = service.update_user_theme_settings(session, current_user.id, settings_in)

    if changes:
        await audit_service.log(
            AuditAction.USER_PROFILE_UPDATED,
            actor=current_user,
            request=request,
            targets=[Target(type="user_theme_settings", id=str(current_user.id))],
            changes=changes,
        )

    return UserThemeSettingsPublic.model_validate(settings)


@router.get(
    "/theme-settings/effective",
    response_model=EffectiveThemeSettings,
)
def get_effective_theme_settings(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID, Query()],
    team_id: Annotated[uuid.UUID | None, Query()] = None,
    system_prefers_dark: Annotated[bool, Query()] = False,
) -> EffectiveThemeSettings:
    """Get effective theme settings for current context.

    Computes final theme settings after applying org → team → user hierarchy.
    Returns resolved theme colors and permission metadata.

    Args:
        organization_id: Organization context
        team_id: Optional team context
        system_prefers_dark: Whether system/browser prefers dark mode (for "system" theme mode)

    Returns:
        Effective theme settings with resolved colors
    """
    return service.get_effective_theme_settings(
        session,
        current_user.id,
        organization_id,
        team_id,
        system_prefers_dark,
    )


@router.get(
    "/theme-settings/predefined-themes",
    response_model=dict[str, dict],
)
def get_predefined_themes() -> dict[str, dict]:
    """Get all predefined theme color palettes.

    Returns a dictionary mapping theme IDs to their color definitions.
    All colors use OKLch color space.
    """
    return PREDEFINED_THEMES
