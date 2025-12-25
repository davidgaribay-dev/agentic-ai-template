"""User profile management routes."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth import (
    CurrentUser,
    Message,
    SessionDep,
    UserPublic,
    UserUpdateMe,
    get_user_by_email,
)
from backend.core.logging import get_logger
from backend.core.storage import (
    FileTooLargeError,
    InvalidFileTypeError,
    StorageError,
    delete_file,
    upload_file,
)
from backend.i18n import SUPPORTED_LOCALE_CODES
from backend.organizations import crud as org_crud
from backend.organizations.models import OrgRole

router = APIRouter()
logger = get_logger(__name__)


class LanguageUpdate(BaseModel):
    """Request body for updating user language preference."""

    language: str = Field(
        ...,
        min_length=2,
        max_length=10,
        description="BCP 47 language code (e.g., 'en', 'es', 'zh')",
    )


class LanguageResponse(BaseModel):
    """Response for language preference endpoints."""

    language: str
    supported_languages: list[str]


@router.get("/me", response_model=UserPublic)
def read_user_me(current_user: CurrentUser) -> Any:
    """Get current user profile."""
    return current_user


@router.patch("/me", response_model=UserPublic)
async def update_user_me(
    request: Request,
    session: SessionDep,
    user_in: UserUpdateMe,
    current_user: CurrentUser,
) -> Any:
    """Update own user profile."""
    if user_in.email:
        existing_user = get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists",
            )

    # Track changes for audit log
    old_values = {}
    new_values = {}
    user_data = user_in.model_dump(exclude_unset=True)
    for field, new_value in user_data.items():
        old_value = getattr(current_user, field, None)
        if old_value != new_value:
            old_values[field] = old_value
            new_values[field] = new_value

    current_user.sqlmodel_update(user_data)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    if old_values:  # Only log if there were actual changes
        await audit_service.log(
            AuditAction.USER_PROFILE_UPDATED,
            actor=current_user,
            request=request,
            targets=[
                Target(type="user", id=str(current_user.id), name=current_user.email)
            ],
            changes={"before": old_values, "after": new_values},
            metadata={"fields_updated": list(new_values.keys())},
        )

    return current_user


@router.post("/me/profile-image", response_model=UserPublic)
async def upload_profile_image(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile,
) -> Any:
    """Upload a profile image for the current user.

    Accepts JPEG, PNG, GIF, or WebP images up to 5MB.
    """
    if not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine file type",
        )

    try:
        had_previous_image = current_user.profile_image_url is not None
        if current_user.profile_image_url:
            delete_file(current_user.profile_image_url)

        image_url = upload_file(
            file=file.file,
            content_type=file.content_type,
            folder="profile-images",
            filename=str(current_user.id),
        )

        current_user.profile_image_url = image_url
        session.add(current_user)
        session.commit()
        session.refresh(current_user)

        logger.info("profile_image_uploaded", user_id=str(current_user.id))

        await audit_service.log(
            AuditAction.USER_PROFILE_IMAGE_UPLOADED,
            actor=current_user,
            request=request,
            targets=[
                Target(type="user", id=str(current_user.id), name=current_user.email)
            ],
            metadata={
                "content_type": file.content_type,
                "filename": file.filename,
                "replaced_existing": had_previous_image,
            },
        )

    except InvalidFileTypeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except FileTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(e),
        ) from e
    except StorageError as e:
        logger.exception("profile_image_upload_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload image",
        ) from e
    else:
        return current_user


@router.delete("/me/profile-image", response_model=UserPublic)
async def delete_profile_image(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Delete the current user's profile image."""
    if not current_user.profile_image_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile image to delete",
        )

    delete_file(current_user.profile_image_url)

    current_user.profile_image_url = None
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    logger.info("profile_image_deleted", user_id=str(current_user.id))

    await audit_service.log(
        AuditAction.USER_PROFILE_IMAGE_DELETED,
        actor=current_user,
        request=request,
        targets=[Target(type="user", id=str(current_user.id), name=current_user.email)],
    )

    return current_user


@router.delete("/me", response_model=Message)
async def delete_user_me(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Delete own user account.

    Platform admins cannot delete themselves through this endpoint.
    Users who are organization owners must transfer ownership or delete
    their organizations first.
    """
    if current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admins cannot delete themselves",
        )

    orgs, _count = org_crud.get_user_organizations(
        session=session,
        user_id=current_user.id,
    )
    org_memberships = []
    for org in orgs:
        membership = org_crud.get_org_membership(
            session=session,
            organization_id=org.id,
            user_id=current_user.id,
        )
        if membership:
            org_memberships.append(
                {
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                    "role": membership.role.value,
                }
            )
            if membership.role == OrgRole.OWNER:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot delete account: you are the owner of '{org.name}'. Transfer ownership or delete the organization first.",
                )

    # Capture user info before deletion
    deleted_user_id = str(current_user.id)
    deleted_user_email = current_user.email

    session.delete(current_user)
    session.commit()
    logger.info("user_self_deleted", email=deleted_user_email)

    await audit_service.log(
        AuditAction.USER_DELETED,
        request=request,
        targets=[Target(type="user", id=deleted_user_id, name=deleted_user_email)],
        metadata={
            "deletion_type": "self_deletion",
            "organizations_affected": org_memberships,
        },
    )

    return Message(message="User deleted successfully")


@router.get("/me/language", response_model=LanguageResponse)
def get_user_language(current_user: CurrentUser) -> Any:
    """Get current user's language preference and list of supported languages."""
    return LanguageResponse(
        language=current_user.language,
        supported_languages=list(SUPPORTED_LOCALE_CODES),
    )


@router.patch("/me/language", response_model=LanguageResponse)
async def update_user_language(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    language_in: LanguageUpdate,
) -> Any:
    """Update the current user's language preference.

    The language must be one of the supported languages.
    """
    if language_in.language not in SUPPORTED_LOCALE_CODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language: {language_in.language}. Supported: {', '.join(sorted(SUPPORTED_LOCALE_CODES))}",
        )

    old_language = current_user.language
    if old_language == language_in.language:
        # No change needed
        return LanguageResponse(
            language=current_user.language,
            supported_languages=list(SUPPORTED_LOCALE_CODES),
        )

    current_user.language = language_in.language
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    logger.info(
        "user_language_updated",
        user_id=str(current_user.id),
        old_language=old_language,
        new_language=language_in.language,
    )

    await audit_service.log(
        AuditAction.USER_SETTINGS_UPDATED,
        actor=current_user,
        request=request,
        targets=[Target(type="user", id=str(current_user.id), name=current_user.email)],
        changes={
            "before": {"language": old_language},
            "after": {"language": language_in.language},
        },
        metadata={"setting_type": "language"},
    )

    return LanguageResponse(
        language=current_user.language,
        supported_languages=list(SUPPORTED_LOCALE_CODES),
    )
