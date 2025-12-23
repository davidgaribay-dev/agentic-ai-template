"""Chat media models for image uploads.

Follows DRY principles using base_models.py mixins:
- ChatMedia: Uses AuditedTable + MCPScopedMixin + SoftDeleteMixin

Scoping logic (same as documents/MCP servers):
- Org-level: team_id=NULL, user_id=NULL
- Team-level: team_id=set, user_id=NULL
- User-level: team_id=set, user_id=set
"""

from typing import Any
import uuid

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from backend.core.base_models import (
    AuditedTable,
    MCPScopedMixin,
    PaginatedResponse,
    SoftDeleteMixin,
    TimestampResponseMixin,
)


class ChatMedia(AuditedTable, MCPScopedMixin, SoftDeleteMixin, table=True):
    """Chat media metadata for uploaded images.

    Inherits from:
    - AuditedTable: id, created_at, updated_at, created_by_id
    - MCPScopedMixin: organization_id (required), team_id (optional), user_id (optional)
    - SoftDeleteMixin: deleted_at
    """

    __tablename__ = "chat_media"

    # File metadata
    filename: str = Field(max_length=255, nullable=False, index=True)
    file_path: str = Field(max_length=512, nullable=False)  # S3 object key
    file_size: int = Field(ge=0)  # bytes
    mime_type: str = Field(max_length=100, nullable=False)  # image/jpeg, etc.

    # Optional image dimensions
    width: int | None = Field(default=None, ge=0)
    height: int | None = Field(default=None, ge=0)

    # Composite indexes for efficient queries
    __table_args__ = (
        Index("idx_chat_media_org_team_user", "organization_id", "team_id", "user_id"),
        Index("idx_chat_media_created_by", "created_by_id"),
        # deleted_at index provided by SoftDeleteMixin
    )


class ChatMediaCreate(SQLModel):
    """Create schema for chat media upload."""

    filename: str = Field(max_length=255)
    file_size: int = Field(ge=0)
    mime_type: str = Field(max_length=100)
    width: int | None = None
    height: int | None = None
    organization_id: uuid.UUID
    team_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None


class ChatMediaPublic(TimestampResponseMixin):
    """Public schema for chat media response."""

    id: uuid.UUID
    organization_id: uuid.UUID
    team_id: uuid.UUID | None
    user_id: uuid.UUID | None
    created_by_id: uuid.UUID
    filename: str
    file_path: str
    file_size: int
    mime_type: str
    width: int | None
    height: int | None
    deleted_at: Any | None  # datetime


# ChatMediasPublic is now PaginatedResponse[ChatMediaPublic]
ChatMediasPublic = PaginatedResponse[ChatMediaPublic]


class StorageUsage(SQLModel):
    """Storage usage statistics for a user."""

    total_bytes: int = Field(default=0, description="Total bytes used")
    file_count: int = Field(default=0, description="Number of files")
    quota_bytes: int | None = Field(
        default=None, description="Storage quota in bytes (None = unlimited)"
    )
    quota_used_percent: float | None = Field(
        default=None, description="Percentage of quota used"
    )


# Rebuild models to resolve relationships
ChatMedia.model_rebuild()
