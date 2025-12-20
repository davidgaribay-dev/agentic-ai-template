"""Password management routes (change, recovery, reset)."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from backend.audit.schemas import AuditAction, LogLevel, Target
from backend.audit.service import audit_service
from backend.auth import (
    CurrentUser,
    Message,
    NewPassword,
    SessionDep,
    UpdatePassword,
    get_user_by_email,
)
from backend.core.logging import get_logger
from backend.core.rate_limit import PASSWORD_RESET_RATE_LIMIT, limiter
from backend.core.security import get_password_hash, verify_password
from backend.core.utils import (
    generate_password_recovery_email,
    generate_password_reset_token,
    send_email,
    verify_password_reset_token,
)

router = APIRouter()
logger = get_logger(__name__)


@router.patch("/me/password", response_model=Message)
async def update_password_me(
    request: Request,
    session: SessionDep,
    body: UpdatePassword,
    current_user: CurrentUser,
) -> Any:
    """Update own password."""
    if not verify_password(body.current_password, current_user.hashed_password):
        await audit_service.log(
            AuditAction.USER_PASSWORD_CHANGE_FAILED,
            actor=current_user,
            request=request,
            outcome="failure",
            severity=LogLevel.WARNING,
            targets=[Target(type="user", id=str(current_user.id), name=current_user.email)],
            error_code="INCORRECT_PASSWORD",
            error_message="Incorrect current password provided",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as the current one",
        )

    hashed_password = get_password_hash(body.new_password)
    current_user.hashed_password = hashed_password
    current_user.password_changed_at = datetime.now(UTC)
    session.add(current_user)
    session.commit()

    await audit_service.log(
        AuditAction.USER_PASSWORD_CHANGED,
        actor=current_user,
        request=request,
        targets=[Target(type="user", id=str(current_user.id), name=current_user.email)],
        metadata={"change_method": "authenticated"},
    )

    return Message(message="Password updated successfully")


@router.post("/password-recovery/{email}", response_model=Message)
@limiter.limit(PASSWORD_RESET_RATE_LIMIT)
async def recover_password(request: Request, email: str, session: SessionDep) -> Any:
    """Request password recovery email.

    Sends an email with a password reset link if the user exists.
    The token includes a timestamp that invalidates the token after password change.

    Note: This endpoint always returns success to prevent user enumeration.
    Rate limited to prevent email flooding attacks.
    """
    user = get_user_by_email(session=session, email=email)

    # Only send email if user exists and is active
    # Always return success message to prevent user enumeration
    if user and user.is_active:
        password_reset_token = generate_password_reset_token(
            email=email, password_changed_at=user.password_changed_at
        )
        email_data = generate_password_recovery_email(
            email_to=user.email, email=email, token=password_reset_token
        )
        send_email(
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
        logger.info("password_recovery_requested", email=email)

        await audit_service.log(
            AuditAction.USER_PASSWORD_RESET_REQUESTED,
            actor=user,
            request=request,
            targets=[Target(type="user", id=str(user.id), name=user.email)],
            metadata={"recovery_email_sent": True},
        )
    else:
        # Log attempt for non-existent user (for security monitoring)
        logger.info("password_recovery_attempted_unknown_email", email=email)

    # Always return same message to prevent user enumeration
    return Message(message="If an account exists with this email, a recovery link has been sent")


@router.post("/reset-password", response_model=Message)
async def reset_password(request: Request, session: SessionDep, body: NewPassword) -> Any:
    """Reset password using a valid reset token.

    Validates the token and updates the user's password.
    The token is automatically invalidated after use because
    password_changed_at is updated, making any previously issued tokens invalid.
    """
    result = verify_password_reset_token(token=body.token)
    if not result:
        await audit_service.log(
            AuditAction.USER_PASSWORD_RESET_FAILED,
            request=request,
            outcome="failure",
            severity=LogLevel.WARNING,
            error_code="INVALID_TOKEN",
            error_message="Invalid password reset token",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token",
        )

    email, token_pca = result

    user = get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The user with this email does not exist",
        )
    if not user.is_active:
        await audit_service.log(
            AuditAction.USER_PASSWORD_RESET_FAILED,
            actor=user,
            request=request,
            outcome="failure",
            severity=LogLevel.WARNING,
            targets=[Target(type="user", id=str(user.id), name=user.email)],
            error_code="INACTIVE_USER",
            error_message="Password reset attempted for inactive user",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )

    if token_pca != 0 and abs(user.password_changed_at.timestamp() - token_pca) > 1:
        await audit_service.log(
            AuditAction.USER_PASSWORD_RESET_FAILED,
            actor=user,
            request=request,
            outcome="failure",
            severity=LogLevel.WARNING,
            targets=[Target(type="user", id=str(user.id), name=user.email)],
            error_code="TOKEN_ALREADY_USED",
            error_message="Password reset token already used or invalid",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token has already been used or is invalid",
        )

    hashed_password = get_password_hash(body.new_password)
    user.hashed_password = hashed_password
    user.password_changed_at = datetime.now(UTC)
    session.add(user)
    session.commit()
    logger.info("password_reset_completed", email=email)

    await audit_service.log(
        AuditAction.USER_PASSWORD_RESET_COMPLETED,
        actor=user,
        request=request,
        targets=[Target(type="user", id=str(user.id), name=user.email)],
        metadata={"reset_method": "token"},
    )

    return Message(message="Password updated successfully")
