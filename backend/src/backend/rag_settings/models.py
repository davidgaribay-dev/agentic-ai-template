"""RAG settings models for hierarchical configuration (org/team/user).

Follows the theme_settings pattern for consistent hierarchical settings management.
"""

from typing import TYPE_CHECKING
import uuid

from sqlalchemy.dialects.postgresql import JSON
from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import TimestampedTable, TimestampResponseMixin

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.organizations.models import Organization
    from backend.teams.models import Team


class RAGSettingsBase(SQLModel):
    """Base RAG settings shared across all hierarchy levels.

    Follows theme_settings pattern - shared configuration fields.
    """

    # Feature toggles
    rag_enabled: bool = Field(default=True)

    # Processing settings
    chunk_size: int = Field(default=1000, ge=100, le=4000)
    chunk_overlap: int = Field(default=200, ge=0, le=1000)
    chunks_per_query: int = Field(default=4, ge=1, le=20)

    # Search settings
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    use_hybrid_search: bool = Field(default=False)

    # Advanced settings
    reranking_enabled: bool = Field(default=False)
    query_rewriting_enabled: bool = Field(default=False)


class OrganizationRAGSettings(RAGSettingsBase, TimestampedTable, table=True):
    """Organization-level RAG settings.

    Inherits from:
    - RAGSettingsBase: rag_enabled, chunk_size, etc.
    - TimestampedTable: id, created_at, updated_at

    Pattern: Same as OrganizationThemeSettings (unique constraint on org_id)
    """

    __tablename__ = "organization_rag_settings"

    # Scoping (unique per org, CASCADE delete)
    organization_id: uuid.UUID = Field(
        foreign_key="organization.id",
        unique=True,
        nullable=False,
        ondelete="CASCADE",
    )

    # Org-specific permission controls
    rag_customization_enabled: bool = Field(default=True)
    allow_team_customization: bool = Field(default=True)
    allow_user_customization: bool = Field(default=True)

    # Resource limits
    max_documents_per_user: int = Field(default=100, ge=1, le=10000)
    max_document_size_mb: int = Field(default=50, ge=1, le=500)
    max_total_storage_gb: int = Field(default=10, ge=1, le=1000)

    # Allowed file types (JSON array)
    allowed_file_types: list[str] = Field(
        default_factory=lambda: [
            # Documents
            "pdf",
            "txt",
            "md",
            "docx",
            "rtf",
            # Structured data
            "json",
            "yaml",
            "yml",
            "xml",
            "csv",
            "xlsx",
            # Code files
            "py",
            "js",
            "ts",
            "jsx",
            "tsx",
            "java",
            "cpp",
            "c",
            "h",
            "go",
            "rs",
            "rb",
            "php",
            "sh",
            "sql",
            # Web
            "html",
            "htm",
            "css",
        ],
        sa_type=JSON,
    )

    # Relationship
    organization: "Organization" = Relationship(back_populates="rag_settings")


class TeamRAGSettings(RAGSettingsBase, TimestampedTable, table=True):
    """Team-level RAG settings.

    Inherits from:
    - RAGSettingsBase: Shared settings
    - TimestampedTable: id, created_at, updated_at

    Pattern: Same as TeamThemeSettings
    """

    __tablename__ = "team_rag_settings"

    # Scoping (unique per team)
    team_id: uuid.UUID = Field(
        foreign_key="team.id",
        unique=True,
        nullable=False,
        ondelete="CASCADE",
    )

    # Team-specific controls
    rag_customization_enabled: bool = Field(default=True)
    allow_user_customization: bool = Field(default=True)

    # Relationship
    team: "Team" = Relationship(back_populates="rag_settings")


class UserRAGSettings(TimestampedTable, table=True):
    """User-level RAG preferences.

    Inherits from:
    - TimestampedTable: id, created_at, updated_at

    Note: Does NOT inherit RAGSettingsBase - only subset of user-customizable fields.
    Pattern: Same as UserThemeSettings (unique per user)
    """

    __tablename__ = "user_rag_settings"

    # Scoping (unique per user)
    user_id: uuid.UUID = Field(
        foreign_key="user.id",
        unique=True,
        nullable=False,
        ondelete="CASCADE",
    )

    # User preferences (subset only)
    rag_enabled: bool = Field(default=True)
    chunks_per_query: int = Field(default=4, ge=1, le=20)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)

    # Relationship
    user: "User" = Relationship(back_populates="rag_settings")


class OrganizationRAGSettingsUpdate(SQLModel):
    """Update schema for organization RAG settings."""

    rag_enabled: bool | None = None
    rag_customization_enabled: bool | None = None
    allow_team_customization: bool | None = None
    allow_user_customization: bool | None = None
    chunk_size: int | None = Field(default=None, ge=100, le=4000)
    chunk_overlap: int | None = Field(default=None, ge=0, le=1000)
    chunks_per_query: int | None = Field(default=None, ge=1, le=20)
    similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    use_hybrid_search: bool | None = None
    reranking_enabled: bool | None = None
    query_rewriting_enabled: bool | None = None
    max_documents_per_user: int | None = Field(default=None, ge=1, le=10000)
    max_document_size_mb: int | None = Field(default=None, ge=1, le=500)
    max_total_storage_gb: int | None = Field(default=None, ge=1, le=1000)
    allowed_file_types: list[str] | None = None


class OrganizationRAGSettingsPublic(RAGSettingsBase, TimestampResponseMixin):
    """Public schema for organization RAG settings."""

    id: uuid.UUID
    organization_id: uuid.UUID
    rag_customization_enabled: bool
    allow_team_customization: bool
    allow_user_customization: bool
    max_documents_per_user: int
    max_document_size_mb: int
    max_total_storage_gb: int
    allowed_file_types: list[str]


class TeamRAGSettingsUpdate(SQLModel):
    """Update schema for team RAG settings."""

    rag_enabled: bool | None = None
    rag_customization_enabled: bool | None = None
    allow_user_customization: bool | None = None
    chunk_size: int | None = Field(default=None, ge=100, le=4000)
    chunk_overlap: int | None = Field(default=None, ge=0, le=1000)
    chunks_per_query: int | None = Field(default=None, ge=1, le=20)
    similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    use_hybrid_search: bool | None = None
    reranking_enabled: bool | None = None
    query_rewriting_enabled: bool | None = None


class TeamRAGSettingsPublic(RAGSettingsBase, TimestampResponseMixin):
    """Public schema for team RAG settings."""

    id: uuid.UUID
    team_id: uuid.UUID
    rag_customization_enabled: bool
    allow_user_customization: bool


class UserRAGSettingsUpdate(SQLModel):
    """Update schema for user RAG settings."""

    rag_enabled: bool | None = None
    chunks_per_query: int | None = Field(default=None, ge=1, le=20)
    similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)


class UserRAGSettingsPublic(TimestampResponseMixin):
    """Public schema for user RAG settings."""

    id: uuid.UUID
    user_id: uuid.UUID
    rag_enabled: bool
    chunks_per_query: int
    similarity_threshold: float


class EffectiveRAGSettings(SQLModel):
    """Computed effective RAG settings after applying hierarchy."""

    rag_enabled: bool
    rag_disabled_by: str | None = None

    chunk_size: int
    chunk_overlap: int
    chunks_per_query: int
    similarity_threshold: float
    use_hybrid_search: bool
    reranking_enabled: bool
    query_rewriting_enabled: bool

    # Permission metadata
    customization_allowed: bool
    customization_disabled_by: str | None = None

    # Resource limits
    max_documents_per_user: int
    max_document_size_mb: int
    allowed_file_types: list[str]


# Import at bottom to avoid circular imports

# Rebuild models to resolve relationships
OrganizationRAGSettings.model_rebuild()
TeamRAGSettings.model_rebuild()
UserRAGSettings.model_rebuild()
