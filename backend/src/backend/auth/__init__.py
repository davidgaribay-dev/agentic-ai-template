from backend.auth.crud import (
    add_password_to_history,
    authenticate,
    check_password_history,
    create_user,
    get_user_by_email,
    get_user_by_id,
    update_user,
)
from backend.auth.deps import (
    CurrentUser,
    SessionDep,
    TokenDep,
    get_current_user,
)
from backend.auth.models import (
    Message,
    NewPassword,
    RefreshTokenRequest,
    Token,
    TokenPayload,
    UpdatePassword,
    User,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from backend.auth.token_revocation import (
    RevokedToken,
    cleanup_expired_tokens,
    is_token_revoked,
    load_revoked_tokens_to_cache,
    revoke_all_user_tokens,
    revoke_token,
)
from backend.core.db import get_db

__all__ = [
    "CurrentUser",
    "Message",
    "NewPassword",
    "RefreshTokenRequest",
    "RevokedToken",
    # Dependencies
    "SessionDep",
    "Token",
    "TokenDep",
    "TokenPayload",
    "UpdatePassword",
    # Models
    "User",
    "UserCreate",
    "UserPublic",
    "UserRegister",
    "UserUpdate",
    "UserUpdateMe",
    "UsersPublic",
    # CRUD
    "add_password_to_history",
    "authenticate",
    "check_password_history",
    "cleanup_expired_tokens",
    "create_user",
    "get_current_user",
    "get_db",
    "get_user_by_email",
    "get_user_by_id",
    "is_token_revoked",
    "load_revoked_tokens_to_cache",
    "revoke_all_user_tokens",
    "revoke_token",
    "update_user",
]
