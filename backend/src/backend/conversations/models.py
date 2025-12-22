import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import (
    OptionalAuditedTable,
    PaginatedResponse,
    SoftDeleteMixin,
    TimestampResponseMixin,
)

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.teams.models import Team


class ConversationBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)


class Conversation(ConversationBase, OptionalAuditedTable, SoftDeleteMixin, table=True):
    """Conversation database model.

    Stores metadata about chat conversations for listing in the UI.
    The actual conversation history is stored in the LangGraph checkpointer.

    Multi-tenant scoping:
    - organization_id: Required, provides first-level data isolation
    - team_id: Required, provides second-level data isolation
    - created_by_id: Tracks who created the conversation (audit trail, from OptionalAuditedTable)
    - user_id: Deprecated, kept for backwards compatibility during migration
    """

    # Multi-tenant scoping (required for new conversations)
    # Note: Not using HierarchicalScopedMixin due to deprecated user_id field semantics
    organization_id: uuid.UUID | None = Field(
        foreign_key="organization.id", nullable=True, ondelete="CASCADE", index=True
    )
    team_id: uuid.UUID | None = Field(
        foreign_key="team.id", nullable=True, ondelete="CASCADE", index=True
    )

    # Deprecated: Direct user ownership (kept for backwards compatibility)
    # New conversations should use team_id for ownership
    user_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="CASCADE"
    )

    # Starring (per-user would need a separate table, this is per-conversation)
    is_starred: bool = Field(default=False)

    # Relationships
    user: Optional["User"] = Relationship(
        back_populates="conversations",
        sa_relationship_kwargs={"foreign_keys": "[Conversation.user_id]"},
    )
    team: Optional["Team"] = Relationship(back_populates="conversations")


class ConversationCreate(SQLModel):
    """Schema for creating a new conversation."""

    title: str = Field(min_length=1, max_length=255)
    # team_id is typically provided via path parameter, not request body


class ConversationUpdate(SQLModel):
    """Schema for updating a conversation."""

    title: str | None = Field(default=None, min_length=1, max_length=255)


class ConversationPublic(ConversationBase, TimestampResponseMixin):
    """Schema for public conversation response."""

    id: uuid.UUID
    organization_id: uuid.UUID | None
    team_id: uuid.UUID | None
    created_by_id: uuid.UUID | None
    user_id: uuid.UUID | None  # Deprecated, included for backwards compatibility
    is_starred: bool
    deleted_at: datetime | None


# ConversationsPublic is now PaginatedResponse[ConversationPublic]
ConversationsPublic = PaginatedResponse[ConversationPublic]


# Forward reference resolution
from backend.auth.models import User  # noqa: E402, F401
from backend.teams.models import Team  # noqa: E402, F401

Conversation.model_rebuild()
