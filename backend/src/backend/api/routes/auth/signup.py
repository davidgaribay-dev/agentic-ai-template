"""User registration routes."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth import (
    SessionDep,
    UserCreate,
    UserPublic,
    UserRegister,
    create_user,
    get_user_by_email,
)
from backend.auth.models import UserRegisterWithInvitation
from backend.core.logging import get_logger
from backend.invitations import crud as invitation_crud
from backend.invitations.models import InvitationStatus
from backend.organizations import crud as org_crud
from backend.organizations.models import OrganizationCreate, OrgRole
from backend.teams import crud as team_crud
from backend.teams.models import TeamRole

router = APIRouter()
logger = get_logger(__name__)


@router.post("/signup", response_model=UserPublic)
async def register_user(
    request: Request,
    session: SessionDep,
    user_in: UserRegister,
) -> Any:
    """Create new user and organization.

    When a user signs up without an invitation, they create a new organization
    and become its owner. Teams can be created later by the user.

    For users with an invitation, use the /signup-with-invitation endpoint instead.
    """
    user = get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    user_create = UserCreate.model_validate(user_in)
    user = create_user(session=session, user_create=user_create)

    org_name = user_in.organization_name
    if not org_name:
        org_name = user_in.email.split("@")[0].title() + "'s Organization"

    org_create = OrganizationCreate(name=org_name)
    organization, _ = org_crud.create_organization(
        session=session,
        organization_in=org_create,
        owner=user,
    )

    logger.info(
        "user_registered_with_org",
        email=user.email,
        organization_id=str(organization.id),
    )

    await audit_service.log(
        AuditAction.USER_SIGNUP,
        actor=user,
        request=request,
        organization_id=organization.id,
        targets=[
            Target(type="user", id=str(user.id), name=user.email),
            Target(type="organization", id=str(organization.id), name=organization.name),
        ],
        metadata={
            "signup_method": "direct",
            "organization_created": True,
        },
    )

    return user


@router.post("/signup-with-invitation", response_model=UserPublic)
async def register_user_with_invitation(
    request: Request,
    session: SessionDep,
    user_in: UserRegisterWithInvitation,
) -> Any:
    """Create new user from an invitation.

    The user is automatically added to the organization (and team, if specified)
    based on the invitation details.
    """
    invitation = invitation_crud.get_invitation_by_token(
        session=session, token=user_in.token
    )
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invitation",
        )

    if not invitation.is_valid():
        if invitation.status == InvitationStatus.EXPIRED or invitation.is_expired():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired",
            )
        elif invitation.status == InvitationStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has already been accepted",
            )
        elif invitation.status == InvitationStatus.REVOKED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has been revoked",
            )

    existing_user = get_user_by_email(session=session, email=invitation.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists. Please login and accept the invitation.",
        )

    user_create = UserCreate(
        email=invitation.email,
        password=user_in.password,
        full_name=user_in.full_name,
    )
    user = create_user(session=session, user_create=user_create)

    org_role = OrgRole(invitation.org_role)
    org_membership = org_crud.add_org_member(
        session=session,
        organization_id=invitation.organization_id,
        user_id=user.id,
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

    invitation_crud.accept_invitation(session=session, invitation=invitation)

    logger.info(
        "user_registered_via_invitation",
        email=user.email,
        organization_id=str(invitation.organization_id),
    )

    # Build targets list
    targets = [Target(type="user", id=str(user.id), name=user.email)]
    if team_joined:
        targets.append(Target(type="team", id=str(team_joined)))

    await audit_service.log(
        AuditAction.USER_SIGNUP_WITH_INVITATION,
        actor=user,
        request=request,
        organization_id=invitation.organization_id,
        team_id=team_joined,
        targets=targets,
        metadata={
            "signup_method": "invitation",
            "invitation_id": str(invitation.id),
            "org_role": org_role.value,
            "team_role": invitation.team_role if team_joined else None,
            "invited_by_id": str(invitation.invited_by_id) if invitation.invited_by_id else None,
        },
    )

    return user
