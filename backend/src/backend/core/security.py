from datetime import UTC, datetime, timedelta
from typing import Any, Literal
import uuid

import jwt
from passlib.context import CryptContext

from backend.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TokenType = Literal["access", "refresh"]


def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
) -> tuple[str, str, datetime]:
    """Create an access token.

    Returns:
        Tuple of (token, jti, expires_at) for revocation tracking
    """
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    jti = str(uuid.uuid4())
    to_encode = {
        "exp": expire,
        "iat": now,
        "sub": str(subject),
        "type": "access",
        "jti": jti,
    }
    token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, jti, expire


def create_refresh_token(
    subject: str,
    expires_delta: timedelta | None = None,
) -> tuple[str, str, datetime]:
    """Create a refresh token.

    Returns:
        Tuple of (token, jti, expires_at) for revocation tracking
    """
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    jti = str(uuid.uuid4())
    to_encode = {
        "exp": expire,
        "iat": now,
        "sub": str(subject),
        "type": "refresh",
        "jti": jti,
    }
    token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, jti, expire


def create_token_pair(subject: str) -> tuple[str, str, int]:
    """Create an access/refresh token pair.

    Returns:
        Tuple of (access_token, refresh_token, expires_in_seconds)
    """
    access_token, _access_jti, _access_exp = create_access_token(subject)
    refresh_token, _refresh_jti, _refresh_exp = create_refresh_token(subject)
    expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # Convert to seconds

    return access_token, refresh_token, expires_in


def decode_token(token: str) -> dict[str, Any]:
    result: dict[str, Any] = jwt.decode(
        token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    return result


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
