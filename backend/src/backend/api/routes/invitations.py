from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth.deps import CurrentUser, SessionDep
from backend.auth.models import Message
from backend.invitations import crud
from backend.invitations.models import (
    InvitationAccept,
    InvitationCreate,
    InvitationCreatedResponse,
    InvitationInfo,
    InvitationPublic,
    InvitationsPublic,
    InvitationStatus,
)
from backend.organizations import crud as org_crud
from backend.organizations.models import OrgRole
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    require_org_permission,
)
from backend.teams import crud as team_crud
from backend.teams.models import TeamRole

router = APIRouter(tags=["invitations"])


org_router = APIRouter(prefix="/organizations/{organization_id}/invitations")


@org_router.get(
    "/",
    response_model=InvitationsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.INVITATIONS_READ))],
)
def list_organization_invitations(
    session: SessionDep,
    org_context: OrgContextDep,
    status_filter: InvitationStatus | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> InvitationsPublic:
    """List all invitations for the organization.

    Requires invitations:read permission.
    """
    invitations, count = crud.get_organization_invitations(
        session=session,
        organization_id=org_context.org_id,
        status_filter=status_filter,
        skip=skip,
        limit=limit,
    )
    return InvitationsPublic(
        data=[InvitationPublic.model_validate(inv) for inv in invitations],
        count=count,
    )


@org_router.post(
    "/",
    response_model=InvitationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_permission(OrgPermission.INVITATIONS_CREATE))],
)
async def create_invitation(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    invitation_in: InvitationCreate,
) -> InvitationCreatedResponse:
    """Create a new invitation.

    Requires invitations:create permission.
    If team_id is provided, the invitee will also be added to that team.

    Returns the invitation with token for self-serve invite links.
    In production with email service, the token would be sent via email instead.
    """
    existing = crud.get_pending_invitation_for_email(
        session=session,
        organization_id=org_context.org_id,
        email=invitation_in.email,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A pending invitation already exists for this email",
        )

    if invitation_in.team_id:
        team = team_crud.get_team_by_id(session=session, team_id=invitation_in.team_id)
        if not team or team.organization_id != org_context.org_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found in this organization",
            )

    invitation, token = crud.create_invitation(
        session=session,
        organization_id=org_context.org_id,
        invited_by_id=org_context.user.id,
        invitation_in=invitation_in,
    )

    await audit_service.log(
        AuditAction.INVITATION_CREATED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        team_id=invitation_in.team_id,
        targets=[
            Target(type="invitation", id=str(invitation.id), name=invitation.email)
        ],
        metadata={
            "invitee_email": invitation.email,
            "org_role": invitation.org_role,
            "team_role": invitation.team_role,
            "team_id": str(invitation_in.team_id) if invitation_in.team_id else None,
            "expires_at": invitation.expires_at.isoformat()
            if invitation.expires_at
            else None,
        },
    )

    response_data = InvitationPublic.model_validate(invitation).model_dump()
    response_data["token"] = token
    return InvitationCreatedResponse(**response_data)


@org_router.get(
    "/{invitation_id}",
    response_model=InvitationPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.INVITATIONS_READ))],
)
def get_invitation(
    session: SessionDep,
    org_context: OrgContextDep,
    invitation_id: Annotated[uuid.UUID, Path(description="Invitation ID")],
) -> InvitationPublic:
    """Get a specific invitation.

    Requires invitations:read permission.
    """
    invitation = crud.get_invitation_by_id(session=session, invitation_id=invitation_id)
    if not invitation or invitation.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )
    return InvitationPublic.model_validate(invitation)


@org_router.post(
    "/{invitation_id}/revoke",
    response_model=InvitationPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.INVITATIONS_REVOKE))],
)
async def revoke_invitation(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    invitation_id: Annotated[uuid.UUID, Path(description="Invitation ID")],
) -> InvitationPublic:
    """Revoke a pending invitation.

    Requires invitations:revoke permission.
    """
    invitation = crud.get_invitation_by_id(session=session, invitation_id=invitation_id)
    if not invitation or invitation.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot revoke invitation with status: {invitation.status}",
        )

    invitee_email = invitation.email
    invitation = crud.revoke_invitation(session=session, invitation=invitation)

    await audit_service.log(
        AuditAction.INVITATION_REVOKED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="invitation", id=str(invitation_id), name=invitee_email)],
        metadata={
            "invitee_email": invitee_email,
            "previous_status": "pending",
        },
    )

    return InvitationPublic.model_validate(invitation)


@org_router.post(
    "/{invitation_id}/resend",
    response_model=InvitationPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.INVITATIONS_CREATE))],
)
async def resend_invitation(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    invitation_id: Annotated[uuid.UUID, Path(description="Invitation ID")],
    expires_in_days: int = Query(default=7, ge=1, le=30),
) -> InvitationPublic:
    """Resend an invitation with a new token.

    Requires invitations:create permission.
    The old invitation is deleted and a new one is created.
    """
    invitation = crud.get_invitation_by_id(session=session, invitation_id=invitation_id)
    if not invitation or invitation.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    if invitation.status == InvitationStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot resend an accepted invitation",
        )

    new_invitation, _token = crud.resend_invitation(
        session=session,
        invitation=invitation,
        expires_in_days=expires_in_days,
    )

    await audit_service.log(
        AuditAction.INVITATION_RESENT,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[
            Target(
                type="invitation", id=str(new_invitation.id), name=new_invitation.email
            )
        ],
        metadata={
            "invitee_email": new_invitation.email,
            "old_invitation_id": str(invitation_id),
            "new_invitation_id": str(new_invitation.id),
            "expires_in_days": expires_in_days,
        },
    )

    return InvitationPublic.model_validate(new_invitation)


@org_router.delete(
    "/{invitation_id}",
    response_model=Message,
    dependencies=[Depends(require_org_permission(OrgPermission.INVITATIONS_REVOKE))],
)
def delete_invitation(
    session: SessionDep,
    org_context: OrgContextDep,
    invitation_id: Annotated[uuid.UUID, Path(description="Invitation ID")],
) -> Message:
    """Delete an invitation.

    Requires invitations:revoke permission.
    """
    invitation = crud.get_invitation_by_id(session=session, invitation_id=invitation_id)
    if not invitation or invitation.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    crud.delete_invitation(session=session, invitation=invitation)
    return Message(message="Invitation deleted successfully")


@router.get("/invitations/info")
def get_invitation_info(
    session: SessionDep,
    token: str = Query(description="Invitation token"),
) -> InvitationInfo:
    """Get information about an invitation before accepting.

    This endpoint is public - no authentication required.
    Used to show invitation details on the accept page.
    """
    invitation = crud.get_invitation_by_token(session=session, token=token)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or invalid",
        )

    if not invitation.is_valid():
        if invitation.status == InvitationStatus.EXPIRED or invitation.is_expired():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired",
            )
        if invitation.status == InvitationStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has already been accepted",
            )
        if invitation.status == InvitationStatus.REVOKED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has been revoked",
            )

    org = org_crud.get_organization_by_id(
        session=session, organization_id=invitation.organization_id
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    team_name = None
    if invitation.team_id:
        team = team_crud.get_team_by_id(session=session, team_id=invitation.team_id)
        if team:
            team_name = team.name

    inviter_name = None
    if invitation.invited_by:
        inviter_name = invitation.invited_by.full_name or invitation.invited_by.email

    return InvitationInfo(
        organization_name=org.name,
        team_name=team_name,
        org_role=invitation.org_role,
        team_role=invitation.team_role,
        email=invitation.email,
        expires_at=invitation.expires_at,
        inviter_name=inviter_name,
    )


@router.post("/invitations/accept")
async def accept_invitation(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    invitation_accept: InvitationAccept,
) -> Message:
    """Accept an invitation and join the organization.

    Requires authentication. The authenticated user's email must match the invitation.
    """
    invitation = crud.get_invitation_by_token(
        session=session, token=invitation_accept.token
    )
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or invalid",
        )

    if not invitation.is_valid():
        if invitation.status == InvitationStatus.EXPIRED or invitation.is_expired():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired",
            )
        if invitation.status == InvitationStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has already been accepted",
            )
        if invitation.status == InvitationStatus.REVOKED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has been revoked",
            )

    if current_user.email.lower() != invitation.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation was sent to a different email address",
        )

    existing_membership = org_crud.get_org_membership(
        session=session,
        organization_id=invitation.organization_id,
        user_id=current_user.id,
    )
    if existing_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this organization",
        )

    org_role = OrgRole(invitation.org_role)
    org_membership = org_crud.add_org_member(
        session=session,
        organization_id=invitation.organization_id,
        user_id=current_user.id,
        role=org_role,
    )

    team_joined = None
    if invitation.team_id and invitation.team_role:
        team_role = TeamRole(invitation.team_role)
        team_crud.add_team_member(
            session=session,
            team_id=invitation.team_id,
            org_member_id=org_membership.id,
            role=team_role,
        )
        team_joined = invitation.team_id

    crud.accept_invitation(session=session, invitation=invitation)

    await audit_service.log(
        AuditAction.INVITATION_ACCEPTED,
        actor=current_user,
        request=request,
        organization_id=invitation.organization_id,
        team_id=team_joined,
        targets=[
            Target(type="invitation", id=str(invitation.id), name=invitation.email),
            Target(type="organization", id=str(invitation.organization_id)),
        ],
        metadata={
            "org_role": org_role.value,
            "team_role": invitation.team_role if team_joined else None,
            "team_id": str(team_joined) if team_joined else None,
            "invited_by_id": str(invitation.invited_by_id)
            if invitation.invited_by_id
            else None,
        },
    )

    await audit_service.log(
        AuditAction.ORG_MEMBER_JOINED,
        actor=current_user,
        request=request,
        organization_id=invitation.organization_id,
        targets=[Target(type="user", id=str(current_user.id), name=current_user.email)],
        metadata={
            "org_role": org_role.value,
            "joined_via": "invitation",
            "invitation_id": str(invitation.id),
        },
    )

    return Message(message="Successfully joined the organization")


router.include_router(org_router)
