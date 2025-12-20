"""Conversations module for chat history tracking."""

from backend.conversations.crud import (
    create_conversation,
    create_conversation_with_id,
    get_conversation,
    get_conversations_by_team,
    get_conversations_by_user,
    hard_delete_conversation,
    restore_conversation,
    set_star_conversation,
    soft_delete_conversation,
    toggle_star_conversation,
    touch_conversation,
    update_conversation,
)
from backend.conversations.models import (
    Conversation,
    ConversationBase,
    ConversationCreate,
    ConversationPublic,
    ConversationsPublic,
    ConversationUpdate,
)

__all__ = [
    "Conversation",
    "ConversationBase",
    "ConversationCreate",
    "ConversationPublic",
    "ConversationsPublic",
    "ConversationUpdate",
    "create_conversation",
    "create_conversation_with_id",
    "get_conversation",
    "get_conversations_by_team",
    "get_conversations_by_user",
    "hard_delete_conversation",
    "restore_conversation",
    "set_star_conversation",
    "soft_delete_conversation",
    "toggle_star_conversation",
    "touch_conversation",
    "update_conversation",
]
