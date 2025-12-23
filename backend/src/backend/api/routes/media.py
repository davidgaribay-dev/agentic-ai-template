"""Chat media API routes for multimodal chat.

Provides endpoints for uploading, listing, retrieving, and deleting
chat media (images) with multi-tenant scoping.
"""

import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
import jwt
from pydantic import ValidationError
from sqlmodel import select

from backend.auth import CurrentUser, SessionDep
from backend.auth.models import TokenPayload, User
from backend.core.config import settings
from backend.core.logging import get_logger
from backend.core.storage import (
    ALLOWED_CHAT_MEDIA_TYPES,
    ChatMediaTooLargeError,
    InvalidChatMediaTypeError,
    StorageError,
    get_chat_media_url,
)
from backend.media.models import (
    ChatMediaCreate,
    ChatMediaPublic,
    ChatMediasPublic,
    StorageUsage,
)
from backend.media.service import (
    create_chat_media,
    delete_chat_media,
    get_chat_media,
    get_chat_media_content,
    get_user_storage_usage,
    list_chat_media,
)
from backend.organizations.models import OrganizationMember
from backend.settings.service import get_or_create_org_settings

router = APIRouter(prefix="/media", tags=["media"])
logger = get_logger(__name__)

# Bytes to MB conversion
MB = 1024 * 1024


def _get_user_from_token(session: SessionDep, token: str) -> User:
    """Validate a JWT token and return the user.

    Used for endpoints that need to accept tokens via query parameter
    (e.g., for image embedding in img tags).
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (jwt.InvalidTokenError, ValidationError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        ) from e

    if token_data.type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user",
        )
    return user


@router.post("/upload", response_model=ChatMediaPublic)
async def upload_media(
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    organization_id: uuid.UUID = Query(..., description="Organization ID"),
    team_id: uuid.UUID | None = Query(None, description="Team ID"),
) -> ChatMediaPublic:
    """Upload a media file (image) for use in chat.

    The file is stored in SeaweedFS and a database record is created.
    File size and type are validated against organization settings.

    Args:
        file: The file to upload
        organization_id: Organization ID (required)
        team_id: Optional team ID for team-scoped media

    Returns:
        The created media record
    """
    # Verify organization membership
    statement = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(statement).first()
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Not a member of this organization",
        )

    # Get org settings for limits
    org_settings = get_or_create_org_settings(session, organization_id)
    max_size_bytes = org_settings.max_media_file_size_mb * MB

    # Validate content type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_CHAT_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. "
            f"Allowed types: {', '.join(ALLOWED_CHAT_MEDIA_TYPES.keys())}",
        )

    # Read file content
    content = await file.read()

    # Validate size
    if len(content) > max_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {len(content) / MB:.1f}MB. "
            f"Maximum size: {org_settings.max_media_file_size_mb}MB",
        )

    # Check storage quota if set
    if org_settings.max_media_storage_mb is not None:
        usage = get_user_storage_usage(
            session=session,
            organization_id=organization_id,
            user_id=current_user.id,
            team_id=team_id,
        )
        quota_bytes = org_settings.max_media_storage_mb * MB
        if usage.total_bytes + len(content) > quota_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"Storage quota exceeded. "
                f"Used: {usage.total_bytes / MB:.1f}MB, "
                f"Quota: {org_settings.max_media_storage_mb}MB",
            )

    # Create media record
    try:
        media = create_chat_media(
            session=session,
            content=content,
            data=ChatMediaCreate(
                filename=file.filename or "unnamed",
                file_size=len(content),
                mime_type=content_type,
                organization_id=organization_id,
                team_id=team_id,
                user_id=current_user.id,
            ),
            created_by_id=current_user.id,
        )
    except InvalidChatMediaTypeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ChatMediaTooLargeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except StorageError as e:
        logger.exception("media_upload_storage_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to upload media") from e

    return ChatMediaPublic.model_validate(media)


@router.get("", response_model=ChatMediasPublic)
async def list_media(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: uuid.UUID = Query(..., description="Organization ID"),
    team_id: uuid.UUID | None = Query(None, description="Team ID filter"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Pagination limit"),
) -> ChatMediasPublic:
    """List media files uploaded by the current user.

    Returns paginated list of media with total count.
    """
    # Verify organization membership
    statement = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(statement).first()
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Not a member of this organization",
        )

    # List media for current user
    media_list, total = list_chat_media(
        session=session,
        organization_id=organization_id,
        team_id=team_id,
        created_by_id=current_user.id,
        skip=skip,
        limit=limit,
    )

    return ChatMediasPublic(
        data=[ChatMediaPublic.model_validate(m) for m in media_list],
        count=total,
    )


@router.get("/usage", response_model=StorageUsage)
async def get_storage_usage(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: uuid.UUID = Query(..., description="Organization ID"),
    team_id: uuid.UUID | None = Query(None, description="Team ID"),
) -> StorageUsage:
    """Get storage usage statistics for the current user.

    Returns total bytes used, file count, and quota information.
    """
    # Verify organization membership
    statement = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(statement).first()
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Not a member of this organization",
        )

    # Get org settings for quota
    org_settings = get_or_create_org_settings(session, organization_id)
    quota_bytes = (
        org_settings.max_media_storage_mb * MB
        if org_settings.max_media_storage_mb
        else None
    )

    return get_user_storage_usage(
        session=session,
        organization_id=organization_id,
        user_id=current_user.id,
        team_id=team_id,
        quota_bytes=quota_bytes,
    )


@router.get("/{media_id}", response_model=ChatMediaPublic)
async def get_media(
    media_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> ChatMediaPublic:
    """Get a specific media record by ID.

    Only the owner can access their media.
    """
    media = get_chat_media(session, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check ownership
    if media.created_by_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this media",
        )

    return ChatMediaPublic.model_validate(media)


@router.get("/{media_id}/content")
async def get_media_content(
    media_id: uuid.UUID,
    session: SessionDep,
    token: str | None = Query(None, description="JWT token for image embedding"),
) -> Response:
    """Get the binary content of a media file.

    Returns the raw file content with appropriate content type.
    Only the owner can access their media.

    Accepts authentication via query parameter `token` for use in img tags,
    since img src cannot include Authorization headers.
    """
    # Authenticate via token query parameter
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide token query parameter.",
        )

    current_user = _get_user_from_token(session, token)

    media = get_chat_media(session, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check ownership
    if media.created_by_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this media",
        )

    try:
        content = get_chat_media_content(media)
    except StorageError as e:
        logger.exception("media_content_error", media_id=str(media_id), error=str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve media") from e

    return Response(
        content=content,
        media_type=media.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{media.filename}"',
            "Cache-Control": "max-age=31536000",  # 1 year cache
        },
    )


@router.get("/{media_id}/url")
async def get_media_url(
    media_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, str]:
    """Get the direct URL for a media file.

    Returns a URL that can be used to access the media directly.
    Only the owner can access their media.
    """
    media = get_chat_media(session, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check ownership
    if media.created_by_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this media",
        )

    return {"url": get_chat_media_url(media.file_path)}


@router.delete("/{media_id}")
async def delete_media_endpoint(
    media_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    hard_delete: bool = Query(False, description="Permanently delete the file"),
) -> dict[str, bool]:
    """Delete a media file.

    By default, performs a soft delete. Set hard_delete=true to permanently
    remove the file from storage.

    Only the owner can delete their media.
    """
    media = get_chat_media(session, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Check ownership
    if media.created_by_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to delete this media",
        )

    delete_chat_media(session, media, hard_delete=hard_delete)

    return {"success": True}
