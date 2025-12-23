"""RAG settings API routes for hierarchical configuration management.

Follows the theme_settings API pattern for consistency.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from backend.audit import audit_service
from backend.audit.schemas import AuditAction, Target
from backend.auth.deps import CurrentUser, SessionDep
from backend.rag_settings import service
from backend.rag_settings.models import (
    EffectiveRAGSettings,
    OrganizationRAGSettingsPublic,
    OrganizationRAGSettingsUpdate,
    TeamRAGSettingsPublic,
    TeamRAGSettingsUpdate,
    UserRAGSettingsPublic,
    UserRAGSettingsUpdate,
)
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    TeamContextDep,
    TeamPermission,
    require_org_permission,
    require_team_permission,
)

router = APIRouter(tags=["rag-settings"])


@router.get(
    "/organizations/{organization_id}/rag-settings",
    response_model=OrganizationRAGSettingsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
def get_org_rag_settings(
    session: SessionDep,
    org_context: OrgContextDep,
) -> OrganizationRAGSettingsPublic:
    """Get organization RAG settings.

    Requires org:read permission (member, admin, or owner).
    """
    settings = service.get_or_create_org_rag_settings(session, org_context.org_id)
    return OrganizationRAGSettingsPublic.model_validate(settings)


@router.put(
    "/organizations/{organization_id}/rag-settings",
    response_model=OrganizationRAGSettingsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def update_org_rag_settings(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    current_user: CurrentUser,
    settings_in: OrganizationRAGSettingsUpdate,
) -> OrganizationRAGSettingsPublic:
    """Update organization RAG settings.

    Requires org:update permission (admin or owner).
    Controls RAG capabilities for the entire organization.
    If rag_customization_enabled is false, teams and users must use org defaults.
    """
    # Get current settings for change tracking
    current_settings = service.get_or_create_org_rag_settings(
        session, org_context.org_id
    )
    changes = {}
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        old_value = getattr(current_settings, field, None)
        if old_value != new_value:
            changes[field] = {"before": old_value, "after": new_value}

    settings = service.update_org_rag_settings(
        session, org_context.org_id, settings_in
    )

    if changes:
        await audit_service.log(
            AuditAction.ORG_SETTINGS_UPDATED,
            actor=current_user,
            request=request,
            organization_id=org_context.org_id,
            targets=[Target(type="organization_rag_settings", id=str(org_context.org_id))],
            changes=changes,
        )

    return OrganizationRAGSettingsPublic.model_validate(settings)


@router.get(
    "/organizations/{organization_id}/teams/{team_id}/rag-settings",
    response_model=TeamRAGSettingsPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_READ))],
)
def get_team_rag_settings(
    session: SessionDep,
    team_context: TeamContextDep,
) -> TeamRAGSettingsPublic:
    """Get team RAG settings.

    Requires team:read permission (team member, admin, or org admin).
    """
    settings = service.get_or_create_team_rag_settings(session, team_context.team_id)
    return TeamRAGSettingsPublic.model_validate(settings)


@router.put(
    "/organizations/{organization_id}/teams/{team_id}/rag-settings",
    response_model=TeamRAGSettingsPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def update_team_rag_settings(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    current_user: CurrentUser,
    settings_in: TeamRAGSettingsUpdate,
) -> TeamRAGSettingsPublic:
    """Update team RAG settings.

    Requires team:update permission (team admin or org admin).
    Teams can only customize if org allows team customization.
    """
    # Get current settings for change tracking
    current_settings = service.get_or_create_team_rag_settings(
        session, team_context.team_id
    )
    changes = {}
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        old_value = getattr(current_settings, field, None)
        if old_value != new_value:
            changes[field] = {"before": old_value, "after": new_value}

    settings = service.update_team_rag_settings(
        session, team_context.team_id, settings_in
    )

    if changes:
        await audit_service.log(
            AuditAction.TEAM_SETTINGS_UPDATED,
            actor=current_user,
            request=request,
            organization_id=team_context.org_id,
            team_id=team_context.team_id,
            targets=[Target(type="team_rag_settings", id=str(team_context.team_id))],
            changes=changes,
        )

    return TeamRAGSettingsPublic.model_validate(settings)


@router.get(
    "/users/me/rag-settings",
    response_model=UserRAGSettingsPublic,
)
def get_user_rag_settings(
    session: SessionDep,
    current_user: CurrentUser,
) -> UserRAGSettingsPublic:
    """Get current user's RAG settings.

    Personal RAG preferences.
    """
    settings = service.get_or_create_user_rag_settings(session, current_user.id)
    return UserRAGSettingsPublic.model_validate(settings)


@router.put(
    "/users/me/rag-settings",
    response_model=UserRAGSettingsPublic,
)
async def update_user_rag_settings(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    settings_in: UserRAGSettingsUpdate,
) -> UserRAGSettingsPublic:
    """Update current user's RAG settings.

    Personal RAG preferences that apply when both org and team allow customization.
    """
    # Get current settings for change tracking
    current_settings = service.get_or_create_user_rag_settings(
        session, current_user.id
    )
    changes = {}
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        old_value = getattr(current_settings, field, None)
        if old_value != new_value:
            changes[field] = {"before": old_value, "after": new_value}

    settings = service.update_user_rag_settings(session, current_user.id, settings_in)

    if changes:
        await audit_service.log(
            AuditAction.USER_PROFILE_UPDATED,
            actor=current_user,
            request=request,
            targets=[Target(type="user_rag_settings", id=str(current_user.id))],
            changes=changes,
        )

    return UserRAGSettingsPublic.model_validate(settings)


@router.get(
    "/rag-settings/effective",
    response_model=EffectiveRAGSettings,
)
def get_effective_rag_settings(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID, Query()],
    team_id: Annotated[uuid.UUID | None, Query()] = None,
) -> EffectiveRAGSettings:
    """Get effective RAG settings for current context.

    Computes final RAG settings after applying org → team → user hierarchy.
    Returns resolved settings and permission metadata.

    Args:
        organization_id: Organization context
        team_id: Optional team context

    Returns:
        Effective RAG settings with resolved values
    """
    return service.get_effective_rag_settings(
        session,
        current_user.id,
        organization_id,
        team_id,
    )
