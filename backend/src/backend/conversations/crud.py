import uuid
from datetime import UTC, datetime

from sqlmodel import Session, col, delete, func, select

from backend.conversations.models import (
    Conversation,
    ConversationCreate,
    ConversationMessage,
    ConversationUpdate,
)

# Re-export for backwards compatibility
__all__ = [
    "create_conversation",
    "create_conversation_with_id",
    "create_conversation_message",
    "delete_conversation_messages",
    "get_conversation",
    "get_conversations_by_team",
    "get_conversations_by_user",
    "hard_delete_conversation",
    "restore_conversation",
    "search_conversations_by_team",
    "set_star_conversation",
    "soft_delete_conversation",
    "toggle_star_conversation",
    "touch_conversation",
    "update_conversation",
]


def create_conversation(
    *,
    session: Session,
    conversation_in: ConversationCreate,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> Conversation:
    """Create a new conversation in the database."""
    db_conversation = Conversation.model_validate(
        conversation_in,
        update={
            "user_id": user_id,
            "created_by_id": user_id,
            "organization_id": organization_id,
            "team_id": team_id,
        },
    )
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return db_conversation


def create_conversation_with_id(
    *,
    session: Session,
    conversation_id: uuid.UUID,
    title: str,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> Conversation:
    db_conversation = Conversation(
        id=conversation_id,
        title=title,
        user_id=user_id,
        created_by_id=user_id,
        organization_id=organization_id,
        team_id=team_id,
    )
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return db_conversation


def get_conversation(*, session: Session, conversation_id: uuid.UUID) -> Conversation | None:
    return session.get(Conversation, conversation_id)


def get_conversations_by_user(
    *,
    session: Session,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
    include_deleted: bool = False,
) -> tuple[list[Conversation], int]:
    """Get conversations owned by a specific user with pagination.

    Returns conversations ordered by starred first, then most recently updated.
    Excludes soft-deleted conversations by default.
    Kept for backward compatibility - prefer get_conversations_by_team for multi-tenant apps.
    """
    conditions = [Conversation.user_id == user_id]
    if not include_deleted:
        conditions.append(Conversation.deleted_at.is_(None))

    count_statement = select(func.count()).select_from(Conversation).where(*conditions)
    count = session.exec(count_statement).one()

    statement = (
        select(Conversation)
        .where(*conditions)
        .order_by(
            col(Conversation.is_starred).desc(),
            col(Conversation.updated_at).desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    conversations = session.exec(statement).all()

    return list(conversations), count


def get_conversations_by_team(
    *,
    session: Session,
    team_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
    include_deleted: bool = False,
) -> tuple[list[Conversation], int]:
    """Get conversations scoped to a team with pagination.

    If user_id is provided, only returns conversations created by that user within the team.
    Returns conversations ordered by starred first, then most recently updated.
    Excludes soft-deleted conversations by default.
    """
    conditions = [Conversation.team_id == team_id]
    if user_id:
        conditions.append(Conversation.created_by_id == user_id)
    if not include_deleted:
        conditions.append(Conversation.deleted_at.is_(None))

    count_statement = select(func.count()).select_from(Conversation).where(*conditions)
    count = session.exec(count_statement).one()

    statement = (
        select(Conversation)
        .where(*conditions)
        .order_by(
            col(Conversation.is_starred).desc(),
            col(Conversation.updated_at).desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    conversations = session.exec(statement).all()

    return list(conversations), count


def update_conversation(
    *,
    session: Session,
    db_conversation: Conversation,
    conversation_in: ConversationUpdate,
) -> Conversation:
    """Update a conversation in the database."""
    conversation_data = conversation_in.model_dump(exclude_unset=True)
    conversation_data["updated_at"] = datetime.now(UTC)
    db_conversation.sqlmodel_update(conversation_data)
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return db_conversation


def touch_conversation(*, session: Session, conversation_id: uuid.UUID) -> Conversation | None:
    """Update the updated_at timestamp for a conversation."""
    db_conversation = session.get(Conversation, conversation_id)
    if db_conversation:
        db_conversation.updated_at = datetime.now(UTC)
        session.add(db_conversation)
        session.commit()
        session.refresh(db_conversation)
    return db_conversation


def soft_delete_conversation(
    *, session: Session, db_conversation: Conversation
) -> Conversation:
    """Soft delete a conversation by setting deleted_at timestamp."""
    db_conversation.deleted_at = datetime.now(UTC)
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return db_conversation


def restore_conversation(
    *, session: Session, db_conversation: Conversation
) -> Conversation:
    """Restore a soft-deleted conversation."""
    db_conversation.deleted_at = None
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return db_conversation


def hard_delete_conversation(*, session: Session, db_conversation: Conversation) -> None:
    """Permanently delete a conversation from the database."""
    session.delete(db_conversation)
    session.commit()


def toggle_star_conversation(
    *, session: Session, db_conversation: Conversation
) -> Conversation:
    """Toggle the starred status of a conversation.

    Note: Does not update updated_at since starring is a user preference,
    not a content change. The timestamp should reflect the last message activity.
    """
    db_conversation.is_starred = not db_conversation.is_starred
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return db_conversation


def set_star_conversation(
    *, session: Session, db_conversation: Conversation, is_starred: bool
) -> Conversation:
    """Set the starred status of a conversation.

    Note: Does not update updated_at since starring is a user preference,
    not a content change. The timestamp should reflect the last message activity.
    """
    db_conversation.is_starred = is_starred
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return db_conversation


def create_conversation_message(
    *,
    session: Session,
    conversation_id: uuid.UUID,
    role: str,
    content: str,
    organization_id: uuid.UUID | None,
    team_id: uuid.UUID | None,
    created_by_id: uuid.UUID | None,
    sources_json: str | None = None,
) -> ConversationMessage:
    """Create a searchable message index entry.

    Messages are indexed for fast search without coupling to LangGraph internals.
    Sources are stored as JSON for RAG citation display.
    """
    message = ConversationMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        organization_id=organization_id,
        team_id=team_id,
        created_by_id=created_by_id,
        sources_json=sources_json,
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    return message


def get_conversation_messages(
    *,
    session: Session,
    conversation_id: uuid.UUID,
) -> list[ConversationMessage]:
    """Get all messages for a conversation ordered by creation time.

    Returns messages with their sources_json for citation display.
    """
    statement = (
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc())
    )
    return list(session.exec(statement).all())


def delete_conversation_messages(
    *,
    session: Session,
    conversation_id: uuid.UUID,
) -> None:
    """Delete all messages for a conversation.

    Note: With CASCADE on conversation_id FK, this happens automatically on hard delete,
    but this function can be used for explicit cleanup if needed.
    """
    statement = delete(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation_id
    )
    session.exec(statement)
    session.commit()


def search_conversations_by_team(
    *,
    session: Session,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    search_query: str,
    skip: int = 0,
    limit: int = 100,
    include_deleted: bool = False,
) -> tuple[list[Conversation], int]:
    """Search conversations by title AND message content.

    Uses separate message index table for performance (avoids querying LangGraph checkpointer).
    Returns conversations ordered by starred first, then most recently updated.
    Excludes soft-deleted conversations by default.
    """
    search_pattern = f"%{search_query}%"

    # Build base conditions
    base_conditions = [
        Conversation.team_id == team_id,
        Conversation.created_by_id == user_id,
    ]
    if not include_deleted:
        base_conditions.append(Conversation.deleted_at.is_(None))

    # Search in title OR message content using LEFT OUTER JOIN
    # This approach avoids UNION and returns proper Conversation objects
    statement = (
        select(Conversation)
        .outerjoin(
            ConversationMessage,
            Conversation.id == ConversationMessage.conversation_id,
        )
        .where(
            *base_conditions,
            (
                Conversation.title.ilike(search_pattern)
                | ConversationMessage.content.ilike(search_pattern)
            ),
        )
        .distinct()  # Remove duplicates (conversations with multiple matching messages)
        .order_by(
            col(Conversation.is_starred).desc(),
            col(Conversation.updated_at).desc(),
        )
        .offset(skip)
        .limit(limit)
    )

    conversations = list(session.exec(statement).all())

    # Count distinct conversations matching the search
    count_statement = (
        select(func.count(func.distinct(Conversation.id)))
        .select_from(Conversation)
        .outerjoin(
            ConversationMessage,
            Conversation.id == ConversationMessage.conversation_id,
        )
        .where(
            *base_conditions,
            (
                Conversation.title.ilike(search_pattern)
                | ConversationMessage.content.ilike(search_pattern)
            ),
        )
    )

    count = session.exec(count_statement).one()

    return conversations, count
