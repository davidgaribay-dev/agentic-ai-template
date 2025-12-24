"""Token revocation service for JWT blacklisting.

Provides mechanisms to revoke tokens before their natural expiration.
Uses a combination of:
- In-memory TTL cache for fast lookups
- Database persistence for durability across restarts
"""

from datetime import UTC, datetime
import uuid

from sqlmodel import Field, Session, SQLModel, select

from backend.core.cache import TTLCache
from backend.core.config import settings
from backend.core.logging import get_logger

logger = get_logger(__name__)

# In-memory cache for fast revocation checks
# TTL matches the maximum token lifetime (refresh token = 7 days)
_revoked_tokens_cache = TTLCache(
    ttl_seconds=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
)


class RevokedToken(SQLModel, table=True):
    """Database model for persisted revoked tokens."""

    __tablename__ = "revoked_tokens"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    jti: str = Field(index=True, unique=True)  # JWT ID
    user_id: uuid.UUID = Field(index=True)
    token_type: str  # "access" or "refresh"
    revoked_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime  # When the token would have naturally expired


def revoke_token(
    session: Session,
    jti: str,
    user_id: uuid.UUID,
    token_type: str,
    expires_at: datetime,
) -> None:
    """Revoke a token by its JTI.

    Args:
        session: Database session
        jti: JWT ID to revoke
        user_id: User who owns the token
        token_type: "access" or "refresh"
        expires_at: When the token would naturally expire
    """
    # Add to in-memory cache for fast lookups
    _revoked_tokens_cache.set(jti, True)

    # Persist to database for durability
    revoked = RevokedToken(
        jti=jti,
        user_id=user_id,
        token_type=token_type,
        expires_at=expires_at,
    )
    session.add(revoked)
    session.commit()

    logger.info(
        "token_revoked",
        jti=jti,
        user_id=str(user_id),
        token_type=token_type,
    )


def revoke_all_user_tokens(session: Session, user_id: uuid.UUID) -> int:
    """Revoke all tokens for a user (e.g., on password change or security event).

    This doesn't immediately add tokens to the cache since we don't know all JTIs.
    Instead, we store a user-level revocation marker.

    Args:
        session: Database session
        user_id: User whose tokens should be revoked

    Returns:
        Count of revoked tokens
    """
    # Mark user's password_changed_at to invalidate older tokens
    # This is checked in is_token_revoked via the user lookup
    # Import here to avoid circular import (User -> token_revocation -> User)
    from backend.auth.models import User as UserModel

    user = session.get(UserModel, user_id)
    if user:
        user.password_changed_at = datetime.now(UTC)
        session.add(user)
        session.commit()
        logger.info("all_user_tokens_revoked", user_id=str(user_id))
        return 1
    return 0


def is_token_revoked(session: Session, jti: str | None) -> bool:
    """Check if a token has been revoked.

    Args:
        session: Database session
        jti: JWT ID to check

    Returns:
        True if the token is revoked
    """
    if jti is None:
        # Legacy tokens without JTI are treated as valid
        # but this should be rare in production
        return False

    # Check in-memory cache first (fast path)
    if _revoked_tokens_cache.get(jti) is True:
        return True

    # Check database (cold start or cache miss)
    statement = select(RevokedToken).where(RevokedToken.jti == jti)
    result = session.exec(statement).first()

    if result:
        # Add to cache for future lookups
        _revoked_tokens_cache.set(jti, True)
        return True

    return False


def cleanup_expired_tokens(session: Session) -> int:
    """Remove expired revoked tokens from the database.

    Tokens that have naturally expired don't need to stay in the revocation list.

    Args:
        session: Database session

    Returns:
        Count of cleaned up tokens
    """
    now = datetime.now(UTC)
    statement = select(RevokedToken).where(RevokedToken.expires_at < now)
    expired_tokens = session.exec(statement).all()

    count = 0
    for token in expired_tokens:
        session.delete(token)
        count += 1

    if count > 0:
        session.commit()
        logger.info("expired_tokens_cleaned", count=count)

    # Also clean up in-memory cache
    _revoked_tokens_cache.cleanup_expired()

    return count


def load_revoked_tokens_to_cache(session: Session) -> int:
    """Load active revoked tokens from database to cache on startup.

    Args:
        session: Database session

    Returns:
        Count of tokens loaded
    """
    now = datetime.now(UTC)
    statement = select(RevokedToken).where(RevokedToken.expires_at > now)
    active_tokens = session.exec(statement).all()

    count = 0
    for token in active_tokens:
        # Calculate remaining TTL
        remaining_seconds = int((token.expires_at - now).total_seconds())
        if remaining_seconds > 0:
            _revoked_tokens_cache.set(token.jti, True, ttl_seconds=remaining_seconds)
            count += 1

    if count > 0:
        logger.info("revoked_tokens_cache_loaded", count=count)

    return count
