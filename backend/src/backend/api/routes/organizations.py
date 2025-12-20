import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, UploadFile, status

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth.deps import CurrentUser, SessionDep
from backend.auth.models import Message
from backend.core.logging import get_logger
from backend.core.storage import (
    FileTooLargeError,
    InvalidFileTypeError,
    StorageError,
    delete_file,
    upload_file,
)
from backend.organizations import crud
from backend.organizations.models import (
    Organization,
    OrganizationCreate,
    OrganizationMemberPublic,
    OrganizationMemberUpdate,
    OrganizationMemberWithUser,
    OrganizationMembersPublic,
    OrganizationPublic,
    OrganizationsPublic,
    OrganizationUpdate,
    OrgRole,
)
from backend.rbac import (
    OrgContextDep,
    OrgPermission,
    RequireOrgAdminDep,
    RequireOrgOwnerDep,
    can_assign_org_role,
    require_org_permission,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/", response_model=OrganizationsPublic)
def list_my_organizations(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> OrganizationsPublic:
    """List all organizations the current user is a member of."""
    organizations, count = crud.get_user_organizations(
        session=session,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
    )
    return OrganizationsPublic(
        data=[OrganizationPublic.model_validate(org) for org in organizations],
        count=count,
    )


@router.post("/", response_model=OrganizationPublic, status_code=status.HTTP_201_CREATED)
async def create_organization(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    organization_in: OrganizationCreate,
) -> OrganizationPublic:
    """Create a new organization with the current user as owner."""
    organization, _ = crud.create_organization(
        session=session,
        organization_in=organization_in,
        owner=current_user,
    )

    await audit_service.log(
        AuditAction.ORG_CREATED,
        actor=current_user,
        request=request,
        organization_id=organization.id,
        targets=[Target(type="organization", id=str(organization.id), name=organization.name)],
    )

    return OrganizationPublic.model_validate(organization)


@router.get(
    "/{organization_id}",
    response_model=OrganizationPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_READ))],
)
def get_organization(
    org_context: OrgContextDep,
) -> OrganizationPublic:
    """Get organization details.

    Requires org:read permission (admin or owner).
    """
    return OrganizationPublic.model_validate(org_context.organization)


@router.patch(
    "/{organization_id}",
    response_model=OrganizationPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def update_organization(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    organization_in: OrganizationUpdate,
) -> OrganizationPublic:
    """Update organization details.

    Requires org:update permission (admin or owner).
    """
    # Track changes for audit log
    old_values = {}
    new_values = {}
    org_data = organization_in.model_dump(exclude_unset=True)
    for field, new_value in org_data.items():
        old_value = getattr(org_context.organization, field, None)
        if old_value != new_value:
            old_values[field] = old_value
            new_values[field] = new_value

    organization = crud.update_organization(
        session=session,
        organization=org_context.organization,
        organization_in=organization_in,
    )

    if old_values:  # Only log if there were actual changes
        await audit_service.log(
            AuditAction.ORG_UPDATED,
            actor=org_context.user,
            request=request,
            organization_id=org_context.org_id,
            targets=[Target(type="organization", id=str(organization.id), name=organization.name)],
            changes={"before": old_values, "after": new_values},
            metadata={"fields_updated": list(new_values.keys())},
        )

    return OrganizationPublic.model_validate(organization)


@router.delete(
    "/{organization_id}",
    response_model=Message,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_DELETE))],
)
async def delete_organization(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    _: RequireOrgOwnerDep,
) -> Message:
    """Delete an organization.

    Requires org:delete permission (owner only).
    WARNING: This will delete all teams, conversations, and data in the organization.
    """
    org_id = org_context.org_id
    org_name = org_context.organization.name

    crud.delete_organization(session=session, organization=org_context.organization)

    await audit_service.log(
        AuditAction.ORG_DELETED,
        actor=org_context.user,
        request=request,
        organization_id=org_id,
        targets=[Target(type="organization", id=str(org_id), name=org_name)],
    )

    return Message(message="Organization deleted successfully")


@router.get(
    "/{organization_id}/members",
    response_model=OrganizationMembersPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.MEMBERS_READ))],
)
def list_organization_members(
    session: SessionDep,
    org_context: OrgContextDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> OrganizationMembersPublic:
    """List all members of the organization.

    Requires members:read permission.
    Returns member data with user details (email, name).
    """
    members, count = crud.get_organization_members(
        session=session,
        organization_id=org_context.org_id,
        skip=skip,
        limit=limit,
    )
    members_with_users = []
    for m in members:
        member_data = OrganizationMemberWithUser(
            id=m.id,
            organization_id=m.organization_id,
            user_id=m.user_id,
            role=m.role,
            created_at=m.created_at,
            updated_at=m.updated_at,
            user_email=m.user.email,
            user_full_name=m.user.full_name,
            user_profile_image_url=m.user.profile_image_url,
        )
        members_with_users.append(member_data)
    return OrganizationMembersPublic(
        data=members_with_users,
        count=count,
    )


@router.get(
    "/{organization_id}/members/{member_id}",
    response_model=OrganizationMemberPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.MEMBERS_READ))],
)
def get_organization_member(
    session: SessionDep,
    org_context: OrgContextDep,
    member_id: Annotated[uuid.UUID, Path(description="Member ID")],
) -> OrganizationMemberPublic:
    """Get a specific organization member.

    Requires members:read permission.
    """
    member = crud.get_org_member_by_id(session=session, member_id=member_id)
    if not member or member.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )
    return OrganizationMemberPublic.model_validate(member)


@router.patch(
    "/{organization_id}/members/{member_id}",
    response_model=OrganizationMemberPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.MEMBERS_UPDATE))],
)
async def update_organization_member(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    member_id: Annotated[uuid.UUID, Path(description="Member ID")],
    member_in: OrganizationMemberUpdate,
) -> OrganizationMemberPublic:
    """Update an organization member's role.

    Requires members:update permission.
    Cannot assign a role higher than your own (except owner can assign any role).
    """
    member = crud.get_org_member_by_id(session=session, member_id=member_id)
    if not member or member.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if member_in.role:
        if not can_assign_org_role(org_context.role, member_in.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot assign a role higher than your own",
            )

        if member.role == OrgRole.OWNER and member_in.role != OrgRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote owner. Use ownership transfer instead.",
            )

        old_role = member.role.value
        member_user_email = member.user.email if member.user else None

        member = crud.update_org_member_role(
            session=session,
            member=member,
            new_role=member_in.role,
        )

        await audit_service.log(
            AuditAction.ORG_MEMBER_ROLE_CHANGED,
            actor=org_context.user,
            request=request,
            organization_id=org_context.org_id,
            targets=[Target(type="user", id=str(member.user_id), name=member_user_email)],
            changes={"before": {"role": old_role}, "after": {"role": member_in.role.value}},
            metadata={
                "member_id": str(member_id),
                "member_email": member_user_email,
            },
        )

    return OrganizationMemberPublic.model_validate(member)


@router.delete(
    "/{organization_id}/members/{member_id}",
    response_model=Message,
    dependencies=[Depends(require_org_permission(OrgPermission.MEMBERS_REMOVE))],
)
async def remove_organization_member(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    member_id: Annotated[uuid.UUID, Path(description="Member ID")],
) -> Message:
    """Remove a member from the organization.

    Requires members:remove permission.
    Cannot remove the owner (ownership must be transferred first).
    """
    member = crud.get_org_member_by_id(session=session, member_id=member_id)
    if not member or member.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if member.role == OrgRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove owner. Transfer ownership first.",
        )

    if member.user_id == org_context.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use the leave endpoint to remove yourself",
        )

    removed_user_id = member.user_id
    removed_user_email = member.user.email if member.user else None

    crud.remove_org_member(session=session, member=member)

    await audit_service.log(
        AuditAction.ORG_MEMBER_REMOVED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="user", id=str(removed_user_id), name=removed_user_email)],
    )

    return Message(message="Member removed successfully")


@router.post(
    "/{organization_id}/leave",
    response_model=Message,
)
async def leave_organization(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
) -> Message:
    """Leave the organization.

    Owners cannot leave without transferring ownership first.
    """
    if org_context.role == OrgRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owners cannot leave. Transfer ownership or delete the organization.",
        )

    crud.remove_org_member(session=session, member=org_context.membership)

    await audit_service.log(
        AuditAction.ORG_MEMBER_LEFT,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="user", id=str(org_context.user.id), name=org_context.user.email)],
        metadata={
            "org_name": org_context.organization.name,
            "previous_role": org_context.role.value if org_context.role else None,
        },
    )

    return Message(message="Successfully left the organization")


@router.post(
    "/{organization_id}/transfer-ownership",
    response_model=Message,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_TRANSFER_OWNERSHIP))],
)
async def transfer_organization_ownership(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    new_owner_id: Annotated[uuid.UUID, Query(description="New owner's user ID")],
    _: RequireOrgOwnerDep,
) -> Message:
    """Transfer organization ownership to another member.

    Requires org:transfer_ownership permission (owner only).
    The current owner will become an admin.
    """
    if new_owner_id == org_context.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer ownership to yourself",
        )

    try:
        crud.transfer_ownership(
            session=session,
            organization_id=org_context.org_id,
            current_owner_id=org_context.user.id,
            new_owner_id=new_owner_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await audit_service.log(
        AuditAction.ORG_OWNERSHIP_TRANSFERRED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="user", id=str(new_owner_id), name="new_owner")],
        metadata={"previous_owner_id": str(org_context.user.id)},
    )

    return Message(message="Ownership transferred successfully")


@router.get(
    "/{organization_id}/my-membership",
    response_model=OrganizationMemberPublic,
)
def get_my_membership(
    org_context: OrgContextDep,
) -> OrganizationMemberPublic:
    """Get current user's membership in the organization."""
    return OrganizationMemberPublic.model_validate(org_context.membership)


@router.post(
    "/{organization_id}/logo",
    response_model=OrganizationPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def upload_organization_logo(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    file: UploadFile,
) -> Any:
    """Upload a logo image for the organization.

    Requires org:update permission (admin or owner).
    Accepts JPEG, PNG, GIF, or WebP images up to 5MB.
    """
    if not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine file type",
        )

    try:
        had_previous_logo = org_context.organization.logo_url is not None
        if org_context.organization.logo_url:
            delete_file(org_context.organization.logo_url)

        logo_url = upload_file(
            file=file.file,
            content_type=file.content_type,
            folder="org-logos",
            filename=str(org_context.org_id),
        )

        org_context.organization.logo_url = logo_url
        session.add(org_context.organization)
        session.commit()
        session.refresh(org_context.organization)

        logger.info("org_logo_uploaded", org_id=str(org_context.org_id))

        await audit_service.log(
            AuditAction.ORG_LOGO_UPLOADED,
            actor=org_context.user,
            request=request,
            organization_id=org_context.org_id,
            targets=[Target(type="organization", id=str(org_context.org_id), name=org_context.organization.name)],
            metadata={
                "content_type": file.content_type,
                "filename": file.filename,
                "replaced_existing": had_previous_logo,
            },
        )

        return OrganizationPublic.model_validate(org_context.organization)

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
        logger.error("org_logo_upload_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload logo",
        )


@router.delete(
    "/{organization_id}/logo",
    response_model=OrganizationPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.ORG_UPDATE))],
)
async def delete_organization_logo(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
) -> Any:
    """Delete the organization's logo.

    Requires org:update permission (admin or owner).
    """
    if not org_context.organization.logo_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No logo to delete",
        )

    delete_file(org_context.organization.logo_url)

    org_context.organization.logo_url = None
    session.add(org_context.organization)
    session.commit()
    session.refresh(org_context.organization)

    logger.info("org_logo_deleted", org_id=str(org_context.org_id))

    await audit_service.log(
        AuditAction.ORG_LOGO_DELETED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="organization", id=str(org_context.org_id), name=org_context.organization.name)],
    )

    return OrganizationPublic.model_validate(org_context.organization)
