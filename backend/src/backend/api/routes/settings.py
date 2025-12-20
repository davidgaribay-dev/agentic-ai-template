import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from backend.auth.deps import CurrentUser, SessionDep
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    TeamContextDep,
    TeamPermission,
    require_org_permission,
    require_team_permission,
)
from backend.settings import service
from backend.settings.models import (
    EffectiveSettings,
    OrganizationSettingsPublic,
    OrganizationSettingsUpdate,
    TeamSettingsPublic,
    TeamSettingsUpdate,
    UserSettingsPublic,
    UserSettingsUpdate,
)

router = APIRouter(tags=["settings"])


@router.get(
    "/organizations/{organization_id}/chat-settings",
    response_model=OrganizationSettingsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
def get_org_chat_settings(
    session: SessionDep,
    org_context: OrgContextDep,
) -> OrganizationSettingsPublic:
    """Get organization chat visibility settings.

    Requires org:read permission (member, admin, or owner).
    """
    settings = service.get_or_create_org_settings(session, org_context.org_id)
    return OrganizationSettingsPublic.model_validate(settings)


@router.put(
    "/organizations/{organization_id}/chat-settings",
    response_model=OrganizationSettingsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
def update_org_chat_settings(
    session: SessionDep,
    org_context: OrgContextDep,
    settings_in: OrganizationSettingsUpdate,
) -> OrganizationSettingsPublic:
    """Update organization chat visibility settings.

    Requires org:update permission (admin or owner).
    These settings are the master controls - if disabled, teams and users
    cannot enable the feature.
    """
    settings = service.update_org_settings(session, org_context.org_id, settings_in)
    return OrganizationSettingsPublic.model_validate(settings)


@router.get(
    "/organizations/{organization_id}/teams/{team_id}/chat-settings",
    response_model=TeamSettingsPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_READ))],
)
def get_team_chat_settings(
    session: SessionDep,
    team_context: TeamContextDep,
) -> TeamSettingsPublic:
    """Get team chat visibility settings.

    Requires team:read permission (team member, admin, or org admin).
    """
    settings = service.get_or_create_team_settings(session, team_context.team_id)
    return TeamSettingsPublic.model_validate(settings)


@router.put(
    "/organizations/{organization_id}/teams/{team_id}/chat-settings",
    response_model=TeamSettingsPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
def update_team_chat_settings(
    session: SessionDep,
    team_context: TeamContextDep,
    settings_in: TeamSettingsUpdate,
) -> TeamSettingsPublic:
    """Update team chat visibility settings.

    Requires team:update permission (team admin or org admin).
    These settings can only enable features that the org has enabled.
    """
    settings = service.update_team_settings(session, team_context.team_id, settings_in)
    return TeamSettingsPublic.model_validate(settings)


@router.get(
    "/users/me/chat-settings",
    response_model=UserSettingsPublic,
)
def get_user_chat_settings(
    session: SessionDep,
    current_user: CurrentUser,
) -> UserSettingsPublic:
    """Get current user's chat visibility settings."""
    settings = service.get_or_create_user_settings(session, current_user.id)
    return UserSettingsPublic.model_validate(settings)


@router.put(
    "/users/me/chat-settings",
    response_model=UserSettingsPublic,
)
def update_user_chat_settings(
    session: SessionDep,
    current_user: CurrentUser,
    settings_in: UserSettingsUpdate,
) -> UserSettingsPublic:
    """Update current user's chat visibility settings.

    These settings are personal preferences that only apply when both
    org and team allow the feature.
    """
    settings = service.update_user_settings(session, current_user.id, settings_in)
    return UserSettingsPublic.model_validate(settings)


@router.get(
    "/settings/effective",
    response_model=EffectiveSettings,
)
def get_effective_chat_settings(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID | None, Query()] = None,
    team_id: Annotated[uuid.UUID | None, Query()] = None,
) -> EffectiveSettings:
    """Get effective chat settings after applying hierarchy.

    Computes the final enabled/disabled state for each chat feature
    by applying the org > team > user hierarchy. Also indicates which
    level disabled each feature (if any).
    """
    return service.get_effective_settings(
        session=session,
        user_id=current_user.id,
        organization_id=organization_id,
        team_id=team_id,
    )
