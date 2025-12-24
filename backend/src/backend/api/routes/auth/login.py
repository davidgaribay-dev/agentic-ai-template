"""Login and token authentication routes."""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
import jwt
from pydantic import ValidationError

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth import (
    CurrentUser,
    SessionDep,
    Token,
    UserPublic,
    authenticate,
    is_token_revoked,
    revoke_token,
)
from backend.auth.models import RefreshTokenRequest, TokenPayload, User
from backend.core.config import settings
from backend.core.logging import get_logger
from backend.core.rate_limit import AUTH_RATE_LIMIT, REFRESH_RATE_LIMIT, limiter
from backend.core.security import create_token_pair

router = APIRouter()
logger = get_logger(__name__)


@router.post("/login", response_model=Token)
@limiter.limit(AUTH_RATE_LIMIT)
async def login_access_token(
    request: Request,  # Required for rate limiter
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """OAuth2 compatible token login.

    Returns both access and refresh tokens.
    - Access token: Short-lived (default 30 min), used for API requests
    - Refresh token: Long-lived (default 7 days), used to get new access tokens

    Rate limited to prevent brute force attacks.
    """
    user = authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        await audit_service.log(
            AuditAction.USER_LOGIN_FAILED,
            request=request,
            outcome="failure",
            metadata={"email": form_data.username},
            error_code="INVALID_CREDENTIALS",
            error_message="Incorrect email or password",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        await audit_service.log(
            AuditAction.USER_LOGIN_FAILED,
            actor=user,
            request=request,
            outcome="failure",
            error_code="INACTIVE_USER",
            error_message="User account is inactive",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )

    access_token, refresh_token, expires_in = create_token_pair(str(user.id))
    logger.info("user_login", email=user.email)

    await audit_service.log(
        AuditAction.USER_LOGIN_SUCCESS,
        actor=user,
        request=request,
        targets=[Target(type="user", id=str(user.id), name=user.email)],
    )

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@router.post("/refresh", response_model=Token)
@limiter.limit(REFRESH_RATE_LIMIT)
def refresh_access_token(
    request: Request,  # Required for rate limiter
    session: SessionDep,
    body: RefreshTokenRequest,
) -> Token:
    """Refresh access token using a refresh token.

    This implements token rotation: each refresh token can only be used once.
    A new refresh token is issued with each access token refresh.
    The old refresh token is revoked to prevent replay attacks.
    """
    try:
        payload = jwt.decode(
            body.refresh_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        token_data = TokenPayload(**payload)
    except (jwt.InvalidTokenError, ValidationError) as e:
        logger.warning("invalid_refresh_token", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    if token_data.type != "refresh":
        logger.warning("wrong_token_type", expected="refresh", got=token_data.type)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if refresh token has been revoked (token rotation security)
    if is_token_revoked(session, token_data.jti):
        logger.warning("refresh_token_already_used", jti=token_data.jti)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has already been used",
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

    # Revoke the old refresh token (token rotation - each token can only be used once)
    if token_data.jti:
        expires_at = datetime.fromtimestamp(payload["exp"], tz=UTC)
        revoke_token(
            session=session,
            jti=token_data.jti,
            user_id=user.id,
            token_type="refresh",
            expires_at=expires_at,
        )

    access_token, new_refresh_token, expires_in = create_token_pair(str(user.id))
    logger.info("token_refreshed", user_id=str(user.id))

    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=expires_in,
    )


@router.post("/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """Test access token validity."""
    return current_user
