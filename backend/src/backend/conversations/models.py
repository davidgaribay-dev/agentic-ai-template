import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.teams.models import Team


class ConversationBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)


class Conversation(ConversationBase, table=True):
    """Conversation database model.

    Stores metadata about chat conversations for listing in the UI.
    The actual conversation history is stored in the LangGraph checkpointer.

    Multi-tenant scoping:
    - organization_id: Required, provides first-level data isolation
    - team_id: Required, provides second-level data isolation
    - created_by_id: Tracks who created the conversation (audit trail)
    - user_id: Deprecated, kept for backwards compatibility during migration
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    # Multi-tenant scoping (required for new conversations)
    organization_id: uuid.UUID | None = Field(
        foreign_key="organization.id", nullable=True, ondelete="CASCADE", index=True
    )
    team_id: uuid.UUID | None = Field(
        foreign_key="team.id", nullable=True, ondelete="CASCADE", index=True
    )
    created_by_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="SET NULL"
    )

    # Deprecated: Direct user ownership (kept for backwards compatibility)
    # New conversations should use team_id for ownership
    user_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="CASCADE"
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Starring (per-user would need a separate table, this is per-conversation)
    is_starred: bool = Field(default=False)

    # Soft delete
    deleted_at: datetime | None = Field(default=None, nullable=True, index=True)

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


class ConversationPublic(ConversationBase):
    """Schema for public conversation response."""

    id: uuid.UUID
    organization_id: uuid.UUID | None
    team_id: uuid.UUID | None
    created_by_id: uuid.UUID | None
    user_id: uuid.UUID | None  # Deprecated, included for backwards compatibility
    created_at: datetime
    updated_at: datetime
    is_starred: bool
    deleted_at: datetime | None


class ConversationsPublic(SQLModel):
    """Schema for paginated conversations response."""

    data: list[ConversationPublic]
    count: int


# Forward reference resolution
from backend.auth.models import User  # noqa: E402, F401
from backend.teams.models import Team  # noqa: E402, F401

Conversation.model_rebuild()
