import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, UploadFile, status

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth.deps import SessionDep
from backend.auth.models import Message
from backend.core.logging import get_logger
from backend.core.storage import (
    FileTooLargeError,
    InvalidFileTypeError,
    StorageError,
    delete_file,
    upload_file,
)
from backend.organizations.models import OrgRole
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    TeamContextDep,
    TeamPermission,
    can_assign_team_role,
    require_org_permission,
    require_team_permission,
)
from backend.teams import crud
from backend.teams.models import (
    Team,
    TeamCreate,
    TeamMemberPublic,
    TeamMemberUpdate,
    TeamMembersPublic,
    TeamPublic,
    TeamRole,
    TeamsPublic,
    TeamUpdate,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/organizations/{organization_id}/teams", tags=["teams"])


@router.get(
    "/",
    response_model=TeamsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.TEAMS_READ))],
)
def list_organization_teams(
    session: SessionDep,
    org_context: OrgContextDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> TeamsPublic:
    """List all teams in the organization.

    Requires teams:read permission.
    """
    teams, count = crud.get_organization_teams(
        session=session,
        organization_id=org_context.org_id,
        skip=skip,
        limit=limit,
    )
    return TeamsPublic(
        data=[TeamPublic.model_validate(team) for team in teams],
        count=count,
    )


@router.get(
    "/my-teams",
    response_model=TeamsPublic,
)
def list_my_teams(
    session: SessionDep,
    org_context: OrgContextDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> TeamsPublic:
    """List teams the current user is a member of in this organization."""
    teams, count = crud.get_user_teams_in_org(
        session=session,
        organization_id=org_context.org_id,
        org_member_id=org_context.membership.id,
        skip=skip,
        limit=limit,
    )
    return TeamsPublic(
        data=[TeamPublic.model_validate(team) for team in teams],
        count=count,
    )


@router.post(
    "/",
    response_model=TeamPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_permission(OrgPermission.TEAMS_CREATE))],
)
async def create_team(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    team_in: TeamCreate,
) -> TeamPublic:
    """Create a new team in the organization.

    Requires teams:create permission.
    The creator becomes the team admin.
    """
    team, _ = crud.create_team(
        session=session,
        organization_id=org_context.org_id,
        team_in=team_in,
        created_by_id=org_context.user.id,
        creator_org_member_id=org_context.membership.id,
    )

    await audit_service.log(
        AuditAction.TEAM_CREATED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        team_id=team.id,
        targets=[Target(type="team", id=str(team.id), name=team.name)],
        metadata={
            "team_name": team.name,
            "team_description": team.description,
        },
    )

    return TeamPublic.model_validate(team)


@router.get(
    "/{team_id}",
    response_model=TeamPublic,
)
def get_team(
    team_context: TeamContextDep,
) -> TeamPublic:
    """Get team details.

    Requires team membership.
    """
    return TeamPublic.model_validate(team_context.team)


@router.patch(
    "/{team_id}",
    response_model=TeamPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def update_team(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    team_in: TeamUpdate,
) -> TeamPublic:
    """Update team details.

    Requires team:update permission (team admin or org admin/owner).
    """
    # Track changes for audit log
    old_values = {}
    new_values = {}
    team_data = team_in.model_dump(exclude_unset=True)
    for field, new_value in team_data.items():
        old_value = getattr(team_context.team, field, None)
        if old_value != new_value:
            old_values[field] = old_value
            new_values[field] = new_value

    team = crud.update_team(
        session=session,
        team=team_context.team,
        team_in=team_in,
    )

    if old_values:  # Only log if there were actual changes
        await audit_service.log(
            AuditAction.TEAM_UPDATED,
            actor=team_context.org_context.user,
            request=request,
            organization_id=team_context.org_id,
            team_id=team_context.team_id,
            targets=[Target(type="team", id=str(team.id), name=team.name)],
            changes={"before": old_values, "after": new_values},
            metadata={"fields_updated": list(new_values.keys())},
        )

    return TeamPublic.model_validate(team)


@router.delete(
    "/{team_id}",
    response_model=Message,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_DELETE))],
)
async def delete_team(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
) -> Message:
    """Delete a team.

    Requires team:delete permission (team admin or org admin/owner).
    WARNING: This will delete all conversations and data in the team.
    """
    team_id = team_context.team_id
    team_name = team_context.team.name

    crud.delete_team(session=session, team=team_context.team)

    await audit_service.log(
        AuditAction.TEAM_DELETED,
        actor=team_context.org_context.user,
        request=request,
        organization_id=team_context.org_id,
        targets=[Target(type="team", id=str(team_id), name=team_name)],
        metadata={"team_name": team_name},
    )

    return Message(message="Team deleted successfully")


@router.get(
    "/{team_id}/members",
    response_model=TeamMembersPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_MEMBERS_READ))],
)
def list_team_members(
    session: SessionDep,
    team_context: TeamContextDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> TeamMembersPublic:
    """List all members of the team.

    Requires team_members:read permission.
    """
    members, count = crud.get_team_members(
        session=session,
        team_id=team_context.team_id,
        skip=skip,
        limit=limit,
    )
    return TeamMembersPublic(
        data=members,
        count=count,
    )


@router.post(
    "/{team_id}/members",
    response_model=TeamMemberPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_MEMBERS_INVITE))],
)
async def add_team_member(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    user_id: Annotated[uuid.UUID, Query(description="User ID to add")],
    role: TeamRole = Query(default=TeamRole.MEMBER),
) -> TeamMemberPublic:
    """Add an organization member to the team.

    Requires team_members:invite permission.
    The user must already be a member of the organization.
    """
    if not can_assign_team_role(
        team_context.org_context.role,
        team_context.role,
        role,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot assign a role higher than your own",
        )

    org_member = crud.get_org_member_by_user_in_org(
        session=session,
        organization_id=team_context.org_id,
        user_id=user_id,
    )
    if not org_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of the organization",
        )

    existing = crud.get_team_membership(
        session=session,
        team_id=team_context.team_id,
        org_member_id=org_member.id,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this team",
        )

    member = crud.add_team_member(
        session=session,
        team_id=team_context.team_id,
        org_member_id=org_member.id,
        role=role,
    )

    added_user_email = org_member.user.email if org_member.user else None

    await audit_service.log(
        AuditAction.TEAM_MEMBER_ADDED,
        actor=team_context.org_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="user", id=str(user_id), name=added_user_email)],
        metadata={
            "team_role": role.value,
            "added_user_id": str(user_id),
            "added_user_email": added_user_email,
        },
    )

    return TeamMemberPublic.model_validate(member)


@router.get(
    "/{team_id}/members/{member_id}",
    response_model=TeamMemberPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_MEMBERS_READ))],
)
def get_team_member(
    session: SessionDep,
    team_context: TeamContextDep,
    member_id: Annotated[uuid.UUID, Path(description="Team member ID")],
) -> TeamMemberPublic:
    """Get a specific team member.

    Requires team_members:read permission.
    """
    member = crud.get_team_member_by_id(session=session, member_id=member_id)
    if not member or member.team_id != team_context.team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )
    return TeamMemberPublic.model_validate(member)


@router.patch(
    "/{team_id}/members/{member_id}",
    response_model=TeamMemberPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_MEMBERS_UPDATE))],
)
async def update_team_member(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    member_id: Annotated[uuid.UUID, Path(description="Team member ID")],
    member_in: TeamMemberUpdate,
) -> TeamMemberPublic:
    """Update a team member's role.

    Requires team_members:update permission.
    Cannot assign a role higher than your own.
    """
    member = crud.get_team_member_by_id(session=session, member_id=member_id)
    if not member or member.team_id != team_context.team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )

    if member_in.role:
        if not can_assign_team_role(
            team_context.org_context.role,
            team_context.role,
            member_in.role,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot assign a role higher than your own",
            )

        old_role = member.role.value
        member = crud.update_team_member_role(
            session=session,
            member=member,
            new_role=member_in.role,
        )

        member_user_email = member.org_member.user.email if member.org_member and member.org_member.user else None
        member_user_id = member.org_member.user_id if member.org_member else None

        await audit_service.log(
            AuditAction.TEAM_MEMBER_ROLE_CHANGED,
            actor=team_context.org_context.user,
            request=request,
            organization_id=team_context.org_id,
            team_id=team_context.team_id,
            targets=[Target(type="user", id=str(member_user_id) if member_user_id else str(member_id), name=member_user_email)],
            changes={"before": {"role": old_role}, "after": {"role": member_in.role.value}},
            metadata={
                "member_id": str(member_id),
                "member_email": member_user_email,
            },
        )

    return TeamMemberPublic.model_validate(member)


@router.delete(
    "/{team_id}/members/{member_id}",
    response_model=Message,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_MEMBERS_REMOVE))],
)
async def remove_team_member(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    member_id: Annotated[uuid.UUID, Path(description="Team member ID")],
) -> Message:
    """Remove a member from the team.

    Requires team_members:remove permission.
    """
    member = crud.get_team_member_by_id(session=session, member_id=member_id)
    if not member or member.team_id != team_context.team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )

    if member.org_member_id == team_context.org_context.membership.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use the leave endpoint to remove yourself",
        )

    removed_user_email = member.org_member.user.email if member.org_member and member.org_member.user else None
    removed_user_id = member.org_member.user_id if member.org_member else None

    crud.remove_team_member(session=session, member=member)

    await audit_service.log(
        AuditAction.TEAM_MEMBER_REMOVED,
        actor=team_context.org_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="user", id=str(removed_user_id) if removed_user_id else str(member_id), name=removed_user_email)],
        metadata={
            "removed_user_id": str(removed_user_id) if removed_user_id else None,
            "removed_user_email": removed_user_email,
        },
    )

    return Message(message="Team member removed successfully")


@router.post(
    "/{team_id}/leave",
    response_model=Message,
)
async def leave_team(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
) -> Message:
    """Leave the team."""
    if team_context.role == TeamRole.ADMIN:
        members, count = crud.get_team_members(
            session=session,
            team_id=team_context.team_id,
        )
        admin_count = sum(1 for m in members if m.role == TeamRole.ADMIN)
        if admin_count == 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot leave: you are the only admin. Promote another member first.",
            )

    crud.remove_team_member(session=session, member=team_context.team_membership)

    await audit_service.log(
        AuditAction.TEAM_MEMBER_LEFT,
        actor=team_context.org_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="user", id=str(team_context.org_context.user.id), name=team_context.org_context.user.email)],
        metadata={
            "team_name": team_context.team.name,
            "previous_role": team_context.role.value if team_context.role else None,
        },
    )

    return Message(message="Successfully left the team")


@router.get(
    "/{team_id}/my-membership",
    response_model=TeamMemberPublic,
)
def get_my_team_membership(
    team_context: TeamContextDep,
) -> TeamMemberPublic:
    """Get current user's membership in the team."""
    return TeamMemberPublic.model_validate(team_context.team_membership)


@router.post(
    "/{team_id}/logo",
    response_model=TeamPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def upload_team_logo(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    file: UploadFile,
) -> Any:
    """Upload a logo image for the team.

    Requires team:update permission (team admin or org admin/owner).
    Accepts JPEG, PNG, GIF, or WebP images up to 5MB.
    """
    if not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine file type",
        )

    try:
        had_previous_logo = team_context.team.logo_url is not None
        if team_context.team.logo_url:
            delete_file(team_context.team.logo_url)

        logo_url = upload_file(
            file=file.file,
            content_type=file.content_type,
            folder="team-logos",
            filename=str(team_context.team_id),
        )

        team_context.team.logo_url = logo_url
        session.add(team_context.team)
        session.commit()
        session.refresh(team_context.team)

        logger.info("team_logo_uploaded", team_id=str(team_context.team_id))

        await audit_service.log(
            AuditAction.TEAM_LOGO_UPLOADED,
            actor=team_context.org_context.user,
            request=request,
            organization_id=team_context.org_id,
            team_id=team_context.team_id,
            targets=[Target(type="team", id=str(team_context.team_id), name=team_context.team.name)],
            metadata={
                "content_type": file.content_type,
                "filename": file.filename,
                "replaced_existing": had_previous_logo,
            },
        )

        return TeamPublic.model_validate(team_context.team)

    except InvalidFileTypeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except FileTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(e),
        )
    except StorageError as e:
        logger.error("team_logo_upload_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload logo",
        )


@router.delete(
    "/{team_id}/logo",
    response_model=TeamPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.TEAM_UPDATE))],
)
async def delete_team_logo(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
) -> Any:
    """Delete the team's logo.

    Requires team:update permission (team admin or org admin/owner).
    """
    if not team_context.team.logo_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No logo to delete",
        )

    delete_file(team_context.team.logo_url)

    team_context.team.logo_url = None
    session.add(team_context.team)
    session.commit()
    session.refresh(team_context.team)

    logger.info("team_logo_deleted", team_id=str(team_context.team_id))

    await audit_service.log(
        AuditAction.TEAM_LOGO_DELETED,
        actor=team_context.org_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="team", id=str(team_context.team_id), name=team_context.team.name)],
    )

    return TeamPublic.model_validate(team_context.team)
