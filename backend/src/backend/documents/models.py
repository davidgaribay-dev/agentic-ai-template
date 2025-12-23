"""Document models for RAG system.

Follows DRY principles using base_models.py mixins:
- Document: Uses AuditedTable + MCPScopedMixin + SoftDeleteMixin
- DocumentChunk: Uses UUIDPrimaryKeyMixin + CreatedAtMixin
"""

from typing import TYPE_CHECKING, Any
import uuid

from sqlalchemy import Column, Index, Text
from sqlmodel import Field, Relationship, SQLModel

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    # Fallback for when pgvector is not installed
    Vector = None

from backend.core.base_models import (
    AuditedTable,
    CreatedAtMixin,
    MCPScopedMixin,
    PaginatedResponse,
    SoftDeleteMixin,
    TimestampResponseMixin,
    UUIDPrimaryKeyMixin,
)

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.organizations.models import Organization
    from backend.teams.models import Team


class Document(AuditedTable, MCPScopedMixin, SoftDeleteMixin, table=True):
    """Document metadata and status tracking.

    Inherits from:
    - AuditedTable: id, created_at, updated_at, created_by_id
    - MCPScopedMixin: organization_id (required), team_id (optional), user_id (optional)
    - SoftDeleteMixin: deleted_at

    Scoping logic (same as MCP servers):
    - Org-level: team_id=NULL, user_id=NULL
    - Team-level: team_id=set, user_id=NULL
    - User-level: team_id=set, user_id=set
    """

    __tablename__ = "documents"

    # File metadata
    filename: str = Field(max_length=255, nullable=False, index=True)
    file_path: str = Field(max_length=512, nullable=False)  # S3 URL
    file_size: int = Field(ge=0)  # bytes
    file_type: str = Field(max_length=10)  # Extension: pdf, txt, docx, etc.
    mime_type: str | None = Field(default=None, max_length=100)

    # Processing status
    processing_status: str = Field(
        default="pending", max_length=20, index=True
    )  # pending | processing | completed | failed
    processing_error: str | None = Field(default=None, sa_type=Text)
    chunk_count: int = Field(default=0, ge=0)

    # Relationships
    chunks: list["DocumentChunk"] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    # Composite indexes for efficient queries
    __table_args__ = (
        Index("idx_documents_org_team_user", "organization_id", "team_id", "user_id"),
        Index("idx_documents_status", "processing_status"),
        # deleted_at index provided by SoftDeleteMixin
    )


class DocumentChunk(UUIDPrimaryKeyMixin, CreatedAtMixin, table=True):
    """Document chunks with embeddings for vector search.

    Inherits from:
    - UUIDPrimaryKeyMixin: id
    - CreatedAtMixin: created_at (no updated_at needed)

    Note: Denormalized tenant fields for fast filtering (no joins needed in vector search).
    """

    __tablename__ = "document_chunks"

    # Foreign key to parent document (CASCADE delete)
    document_id: uuid.UUID = Field(
        foreign_key="documents.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
    )

    # Denormalized tenant fields (copied from Document for fast filtering)
    # IMPORTANT: These avoid expensive joins during vector search
    organization_id: uuid.UUID = Field(nullable=False, index=True)
    team_id: uuid.UUID | None = Field(nullable=True, index=True)
    user_id: uuid.UUID | None = Field(nullable=True, index=True)

    # Chunk data
    chunk_index: int = Field(ge=0)  # Order within document (0-indexed)
    content: str = Field(sa_type=Text, nullable=False)  # Actual chunk text
    token_count: int | None = Field(default=None, ge=0)  # Optional token count

    # Vector embedding (pgvector) - 1536 dimensions for text-embedding-3-small
    # Use Any type hint since Vector is optional import
    embedding: Any | None = Field(
        default=None,
        sa_column=Column(Vector(1536), nullable=True) if Vector else None,  # type: ignore[arg-type]
    )

    # Metadata (JSON) - context about this chunk
    metadata_: dict[str, Any] | None = Field(default=None, sa_column=Column(Text))

    # Relationship
    document: Document = Relationship(back_populates="chunks")

    # Composite indexes for multi-tenant vector search
    __table_args__ = (
        Index("idx_chunks_document", "document_id"),
        Index("idx_chunks_tenant", "organization_id", "team_id", "user_id"),
        # Vector index created in migration (HNSW)
    )


class DocumentCreate(SQLModel):
    """Create schema for document upload."""

    filename: str = Field(max_length=255)
    file_size: int = Field(ge=0)
    file_type: str = Field(max_length=10)
    mime_type: str | None = None
    organization_id: uuid.UUID
    team_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None


class DocumentUpdate(SQLModel):
    """Update schema for document metadata."""

    filename: str | None = Field(default=None, max_length=255)
    processing_status: str | None = Field(default=None, max_length=20)
    processing_error: str | None = None
    chunk_count: int | None = Field(default=None, ge=0)


class DocumentPublic(TimestampResponseMixin):
    """Public schema for document response."""

    id: uuid.UUID
    organization_id: uuid.UUID
    team_id: uuid.UUID | None
    user_id: uuid.UUID | None
    created_by_id: uuid.UUID
    filename: str
    file_path: str
    file_size: int
    file_type: str
    mime_type: str | None
    processing_status: str
    processing_error: str | None
    chunk_count: int
    deleted_at: Any | None  # datetime


# DocumentsPublic is now PaginatedResponse[DocumentPublic]
DocumentsPublic = PaginatedResponse[DocumentPublic]


class DocumentChunkPublic(SQLModel):
    """Public schema for document chunk response."""

    id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    content: str
    token_count: int | None
    metadata_: dict[str, Any] | None
    created_at: Any  # datetime


# Import at bottom to avoid circular imports
from backend.auth.models import User  # noqa: E402, F401
from backend.organizations.models import Organization  # noqa: E402, F401
from backend.teams.models import Team  # noqa: E402, F401

# Rebuild models to resolve relationships
Document.model_rebuild()
DocumentChunk.model_rebuild()
