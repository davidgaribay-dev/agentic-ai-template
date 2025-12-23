"""Chat media service for managing uploaded images.

Provides CRUD operations with multi-tenant scoping and storage management.
"""

from datetime import UTC, datetime
import uuid

from sqlmodel import Session, func, select

from backend.core.logging import get_logger
from backend.core.storage import (
    delete_chat_media as storage_delete,
)
from backend.core.storage import (
    get_chat_media_content as storage_get_content,
)
from backend.core.storage import (
    upload_chat_media as storage_upload,
)
from backend.media.models import ChatMedia, ChatMediaCreate, StorageUsage

logger = get_logger(__name__)


def create_chat_media(
    session: Session,
    content: bytes,
    data: ChatMediaCreate,
    created_by_id: uuid.UUID,
) -> ChatMedia:
    """Upload and create a chat media record.

    Args:
        session: Database session
        content: File content as bytes
        data: Media creation data
        created_by_id: ID of the user uploading

    Returns:
        Created ChatMedia record
    """
    # Upload to S3/SeaweedFS
    file_path = storage_upload(
        content=content,
        filename=data.filename,
        content_type=data.mime_type,
        org_id=data.organization_id,
        team_id=data.team_id,
        user_id=data.user_id,
    )

    # Create database record
    media = ChatMedia(
        filename=data.filename,
        file_path=file_path,
        file_size=data.file_size,
        mime_type=data.mime_type,
        width=data.width,
        height=data.height,
        organization_id=data.organization_id,
        team_id=data.team_id,
        user_id=data.user_id,
        created_by_id=created_by_id,
    )

    session.add(media)
    session.commit()
    session.refresh(media)

    logger.info(
        "chat_media_created",
        media_id=str(media.id),
        filename=media.filename,
        file_size=media.file_size,
        org_id=str(data.organization_id),
        team_id=str(data.team_id) if data.team_id else None,
        user_id=str(data.user_id) if data.user_id else None,
    )

    return media


def get_chat_media(
    session: Session,
    media_id: uuid.UUID,
    include_deleted: bool = False,
) -> ChatMedia | None:
    """Get a chat media record by ID.

    Args:
        session: Database session
        media_id: Media ID to fetch
        include_deleted: Whether to include soft-deleted records

    Returns:
        ChatMedia or None if not found
    """
    statement = select(ChatMedia).where(ChatMedia.id == media_id)

    if not include_deleted:
        statement = statement.where(ChatMedia.deleted_at.is_(None))

    return session.exec(statement).first()


def list_chat_media(
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    created_by_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
    include_deleted: bool = False,
) -> tuple[list[ChatMedia], int]:
    """List chat media with multi-tenant filtering.

    Args:
        session: Database session
        organization_id: Organization ID (required)
        team_id: Optional team ID filter
        user_id: Optional user ID filter (for user-scoped media)
        created_by_id: Optional filter by uploader
        skip: Pagination offset
        limit: Pagination limit
        include_deleted: Whether to include soft-deleted records

    Returns:
        Tuple of (media list, total count)
    """
    # Base query with org filter
    statement = select(ChatMedia).where(ChatMedia.organization_id == organization_id)

    # Apply team filter if provided
    if team_id is not None:
        statement = statement.where(ChatMedia.team_id == team_id)

    # Apply user filter if provided
    if user_id is not None:
        statement = statement.where(ChatMedia.user_id == user_id)

    # Filter by creator if provided
    if created_by_id is not None:
        statement = statement.where(ChatMedia.created_by_id == created_by_id)

    # Exclude deleted unless requested
    if not include_deleted:
        statement = statement.where(ChatMedia.deleted_at.is_(None))

    # Get total count
    count_statement = select(func.count()).select_from(statement.subquery())
    total = session.exec(count_statement).one()

    # Apply pagination and ordering
    statement = statement.order_by(ChatMedia.created_at.desc())
    statement = statement.offset(skip).limit(limit)

    media_list = list(session.exec(statement).all())

    return media_list, total


def get_chat_media_content(media: ChatMedia) -> bytes:
    """Get the binary content of a chat media file.

    Args:
        media: ChatMedia record

    Returns:
        File content as bytes
    """
    return storage_get_content(media.file_path)


def delete_chat_media(
    session: Session,
    media: ChatMedia,
    hard_delete: bool = False,
) -> bool:
    """Delete a chat media record.

    Args:
        session: Database session
        media: ChatMedia to delete
        hard_delete: If True, permanently delete. If False, soft delete.

    Returns:
        True if deleted successfully
    """
    if hard_delete:
        # Delete from storage
        storage_delete(media.file_path)
        # Delete from database
        session.delete(media)
    else:
        # Soft delete
        media.deleted_at = datetime.now(UTC)
        session.add(media)

    session.commit()

    logger.info(
        "chat_media_deleted",
        media_id=str(media.id),
        hard_delete=hard_delete,
    )

    return True


def get_user_storage_usage(
    session: Session,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    team_id: uuid.UUID | None = None,
    quota_bytes: int | None = None,
) -> StorageUsage:
    """Get storage usage statistics for a user.

    Args:
        session: Database session
        organization_id: Organization ID
        user_id: User ID
        team_id: Optional team ID for team-scoped usage
        quota_bytes: Optional quota to calculate percentage

    Returns:
        StorageUsage with total bytes and file count
    """
    statement = select(
        func.coalesce(func.sum(ChatMedia.file_size), 0).label("total_bytes"),
        func.count(ChatMedia.id).label("file_count"),
    ).where(
        ChatMedia.organization_id == organization_id,
        ChatMedia.created_by_id == user_id,
        ChatMedia.deleted_at.is_(None),
    )

    if team_id is not None:
        statement = statement.where(ChatMedia.team_id == team_id)

    result = session.exec(statement).first()

    total_bytes = result[0] if result else 0
    file_count = result[1] if result else 0

    quota_used_percent = None
    if quota_bytes is not None and quota_bytes > 0:
        quota_used_percent = (total_bytes / quota_bytes) * 100

    return StorageUsage(
        total_bytes=total_bytes,
        file_count=file_count,
        quota_bytes=quota_bytes,
        quota_used_percent=quota_used_percent,
    )


def get_media_by_ids(
    session: Session,
    media_ids: list[uuid.UUID],
    user_id: uuid.UUID,
) -> list[ChatMedia]:
    """Get multiple media records by IDs, filtered by user ownership.

    Used when attaching media to chat messages.

    Args:
        session: Database session
        media_ids: List of media IDs to fetch
        user_id: User ID (must be creator of the media)

    Returns:
        List of ChatMedia records owned by the user
    """
    if not media_ids:
        return []

    statement = select(ChatMedia).where(
        ChatMedia.id.in_(media_ids),
        ChatMedia.created_by_id == user_id,
        ChatMedia.deleted_at.is_(None),
    )

    return list(session.exec(statement).all())
