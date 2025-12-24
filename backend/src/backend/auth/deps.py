from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from pydantic import ValidationError
from sqlmodel import Session

from backend.auth.models import TokenPayload, User
from backend.auth.token_revocation import is_token_revoked
from backend.core.config import settings
from backend.core.db import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(oauth2_scheme)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    """Get the current authenticated user from JWT token.

    Args:
        session: Database session
        token: JWT token from Authorization header

    Returns:
        Current authenticated user

    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (jwt.InvalidTokenError, ValidationError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    if token_data.type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Use access token for API requests.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token has been revoked
    if is_token_revoked(session, token_data.jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token was issued before password change (implicit revocation)
    if token_data.jti and "iat" in payload:
        token_issued_at = datetime.fromtimestamp(payload["iat"], tz=UTC)
        if user.password_changed_at and token_issued_at < user.password_changed_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalidated by password change",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_platform_admin(current_user: CurrentUser) -> User:
    """Get the current user and verify they are a platform admin.

    Platform admins have access to all organizations and resources.
    This is for platform-wide administration.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user if they are a platform admin

    Raises:
        HTTPException: If user is not a platform admin
    """
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


PlatformAdminDep = Annotated[User, Depends(get_current_platform_admin)]
