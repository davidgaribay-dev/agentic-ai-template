import uuid
from datetime import UTC, datetime

from sqlmodel import Session, col, func, select

from backend.conversations.models import Conversation, ConversationCreate, ConversationUpdate

# Re-export for backwards compatibility
__all__ = [
    "create_conversation",
    "create_conversation_with_id",
    "get_conversation",
    "get_conversations_by_user",
    "get_conversations_by_team",
    "update_conversation",
    "touch_conversation",
    "soft_delete_conversation",
    "restore_conversation",
    "hard_delete_conversation",
    "toggle_star_conversation",
    "set_star_conversation",
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
