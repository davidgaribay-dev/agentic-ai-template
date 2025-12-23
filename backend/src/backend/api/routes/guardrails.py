"""Guardrails API routes for AI content filtering.

Provides endpoints for managing guardrails at org, team, and user levels.
"""

from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import CurrentUser, SessionDep
from backend.guardrails.models import (
    EffectiveGuardrails,
    GuardrailsTestRequest,
    GuardrailsTestResponse,
    OrganizationGuardrailsPublic,
    OrganizationGuardrailsUpdate,
    TeamGuardrailsPublic,
    TeamGuardrailsUpdate,
    UserGuardrailsPublic,
    UserGuardrailsUpdate,
)
from backend.guardrails.patterns import PII_TYPES
from backend.guardrails.service import (
    get_effective_guardrails,
    get_or_create_org_guardrails,
    get_or_create_team_guardrails,
    get_or_create_user_guardrails,
    test_guardrails,
    update_org_guardrails,
    update_team_guardrails,
    update_user_guardrails,
)
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    RequireOrgAdminDep,
    RequireTeamAdminDep,
    TeamContextDep,
    require_org_permission,
)

router = APIRouter(prefix="/guardrails", tags=["guardrails"])


# Organization guardrails routes
@router.get(
    "/organizations/{organization_id}",
    response_model=OrganizationGuardrailsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
async def get_org_guardrails(
    session: SessionDep,
    org_context: OrgContextDep,
    _admin: RequireOrgAdminDep,
) -> OrganizationGuardrailsPublic:
    """Get guardrails for an organization.

    Requires org admin or owner role.
    """
    guardrails = get_or_create_org_guardrails(session, org_context.organization.id)
    return OrganizationGuardrailsPublic.model_validate(guardrails)


@router.put(
    "/organizations/{organization_id}",
    response_model=OrganizationGuardrailsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def update_org_guardrails_endpoint(
    data: OrganizationGuardrailsUpdate,
    session: SessionDep,
    org_context: OrgContextDep,
    _admin: RequireOrgAdminDep,
) -> OrganizationGuardrailsPublic:
    """Update guardrails for an organization.

    Requires org admin or owner role.
    """
    guardrails = update_org_guardrails(session, org_context.organization.id, data)
    return OrganizationGuardrailsPublic.model_validate(guardrails)


# Team guardrails routes
@router.get(
    "/organizations/{organization_id}/teams/{team_id}",
    response_model=TeamGuardrailsPublic,
)
async def get_team_guardrails(
    session: SessionDep,
    team_context: TeamContextDep,
    _admin: RequireTeamAdminDep,
) -> TeamGuardrailsPublic:
    """Get guardrails for a team.

    Requires team admin role.
    """
    # Check if org allows team override
    org_guardrails = get_or_create_org_guardrails(
        session, team_context.org_context.organization.id
    )
    if not org_guardrails.allow_team_override:
        raise HTTPException(
            status_code=403,
            detail="Organization does not allow team guardrail customization",
        )

    guardrails = get_or_create_team_guardrails(session, team_context.team.id)
    return TeamGuardrailsPublic.model_validate(guardrails)


@router.put(
    "/organizations/{organization_id}/teams/{team_id}",
    response_model=TeamGuardrailsPublic,
)
async def update_team_guardrails_endpoint(
    data: TeamGuardrailsUpdate,
    session: SessionDep,
    team_context: TeamContextDep,
    _admin: RequireTeamAdminDep,
) -> TeamGuardrailsPublic:
    """Update guardrails for a team.

    Requires team admin role.
    """
    # Check if org allows team override
    org_guardrails = get_or_create_org_guardrails(
        session, team_context.org_context.organization.id
    )
    if not org_guardrails.allow_team_override:
        raise HTTPException(
            status_code=403,
            detail="Organization does not allow team guardrail customization",
        )

    guardrails = update_team_guardrails(session, team_context.team.id, data)
    return TeamGuardrailsPublic.model_validate(guardrails)


# User guardrails routes
@router.get(
    "/me",
    response_model=UserGuardrailsPublic,
)
async def get_user_guardrails(
    session: SessionDep,
    current_user: CurrentUser,
) -> UserGuardrailsPublic:
    """Get guardrails for the current user."""
    guardrails = get_or_create_user_guardrails(session, current_user.id)
    return UserGuardrailsPublic.model_validate(guardrails)


@router.put(
    "/me",
    response_model=UserGuardrailsPublic,
)
async def update_user_guardrails_endpoint(
    data: UserGuardrailsUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> UserGuardrailsPublic:
    """Update guardrails for the current user."""
    guardrails = update_user_guardrails(session, current_user.id, data)
    return UserGuardrailsPublic.model_validate(guardrails)


# Effective guardrails route
@router.get(
    "/effective",
    response_model=EffectiveGuardrails,
)
async def get_effective_guardrails_endpoint(
    session: SessionDep,
    current_user: CurrentUser,
    org_id: Annotated[
        str | None, Query(description="Organization ID for context")
    ] = None,
    team_id: Annotated[str | None, Query(description="Team ID for context")] = None,
) -> EffectiveGuardrails:
    """Get effective guardrails after applying hierarchy.

    This computes the merged guardrails from org -> team -> user levels.
    """
    org_uuid = uuid.UUID(org_id) if org_id else None
    team_uuid = uuid.UUID(team_id) if team_id else None

    return get_effective_guardrails(
        session=session,
        user_id=current_user.id,
        organization_id=org_uuid,
        team_id=team_uuid,
    )


# Test guardrails route
@router.post(
    "/test",
    response_model=GuardrailsTestResponse,
)
async def test_guardrails_endpoint(
    request: GuardrailsTestRequest,
    session: SessionDep,
    current_user: CurrentUser,
    org_id: Annotated[
        str | None, Query(description="Organization ID for context")
    ] = None,
    team_id: Annotated[str | None, Query(description="Team ID for context")] = None,
) -> GuardrailsTestResponse:
    """Test content against guardrails (dry run).

    This allows users to test their guardrail configuration without
    actually blocking content.
    """
    org_uuid = uuid.UUID(org_id) if org_id else None
    team_uuid = uuid.UUID(team_id) if team_id else None

    effective = get_effective_guardrails(
        session=session,
        user_id=current_user.id,
        organization_id=org_uuid,
        team_id=team_uuid,
    )

    result = test_guardrails(
        content=request.content,
        direction=request.direction,
        guardrails=effective,
    )

    return GuardrailsTestResponse(
        passed=result.passed,
        action=result.action,
        matches=result.matches,
        redacted_content=result.redacted_content,
    )


# PII types reference
@router.get(
    "/pii-types",
    response_model=list[str],
)
async def get_pii_types() -> list[str]:
    """Get available PII types for detection."""
    return PII_TYPES
