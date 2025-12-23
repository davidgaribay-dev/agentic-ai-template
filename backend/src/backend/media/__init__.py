"""Media module for chat image uploads.

Provides models and services for managing chat media (images) with
multi-tenant scoping (org → team → user) and SeaweedFS storage.
"""

from backend.media.models import (
    ChatMedia,
    ChatMediaCreate,
    ChatMediaPublic,
    ChatMediasPublic,
)
from backend.media.service import (
    create_chat_media,
    delete_chat_media,
    get_chat_media,
    get_chat_media_content,
    get_user_storage_usage,
    list_chat_media,
)

__all__ = [
    "ChatMedia",
    "ChatMediaCreate",
    "ChatMediaPublic",
    "ChatMediasPublic",
    "create_chat_media",
    "delete_chat_media",
    "get_chat_media",
    "get_chat_media_content",
    "get_user_storage_usage",
    "list_chat_media",
]
