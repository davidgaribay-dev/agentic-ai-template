from datetime import UTC, datetime
import json
from typing import TYPE_CHECKING, Any, Optional
import uuid

from pydantic import field_validator
from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import (
    OptionalAuditedTable,
    PaginatedResponse,
    SoftDeleteMixin,
    TimestampResponseMixin,
)
from backend.core.logging import get_logger

logger = get_logger(__name__)

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


class ConversationMessage(SQLModel, table=True):
    """Indexed message content for fast search.

    Separate from LangGraph checkpointer for performance.
    Automatically populated when messages are sent/received.
    Follows industry best practice of separating UI search concerns
    from checkpoint state management.
    """

    __tablename__ = "conversation_message"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    conversation_id: uuid.UUID = Field(
        foreign_key="conversation.id",
        ondelete="CASCADE",
        index=True,
    )
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text content")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # RAG sources (JSON array of source objects for citation display)
    sources_json: str | None = Field(
        default=None,
        description="JSON array of RAG sources for this message",
    )

    # Media attachments (JSON array of media info for image display)
    media_json: str | None = Field(
        default=None,
        description="JSON array of media attachments for this message",
    )

    # Guardrail metadata for blocked messages
    guardrail_blocked: bool = Field(
        default=False,
        description="True if this message was blocked by guardrails",
    )

    # Multi-tenant denormalization for fast filtering
    organization_id: uuid.UUID | None = Field(default=None, index=True)
    team_id: uuid.UUID | None = Field(default=None, index=True)
    created_by_id: uuid.UUID | None = Field(
        default=None, index=True
    )  # User who owns the conversation

    # Soft delete support (set when parent conversation is soft-deleted)
    deleted_at: datetime | None = Field(default=None, index=True)

    @field_validator("sources_json", mode="before")
    @classmethod
    def validate_sources_json(cls, v: Any) -> str | None:
        """Validate sources_json is valid JSON array."""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
            except json.JSONDecodeError as e:
                logger.warning("sources_json_invalid", error=str(e))
                return None
            else:
                if not isinstance(parsed, list):
                    logger.warning(
                        "sources_json_not_array", value_type=type(parsed).__name__
                    )
                    return None
                return v
        return None

    @field_validator("media_json", mode="before")
    @classmethod
    def validate_media_json(cls, v: Any) -> str | None:
        """Validate media_json is valid JSON array."""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
            except json.JSONDecodeError as e:
                logger.warning("media_json_invalid", error=str(e))
                return None
            else:
                if not isinstance(parsed, list):
                    logger.warning(
                        "media_json_not_array", value_type=type(parsed).__name__
                    )
                    return None
                return v
        return None


# Forward reference resolution

Conversation.model_rebuild()
