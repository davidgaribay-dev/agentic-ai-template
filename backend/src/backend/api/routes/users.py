import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import func, select

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth import (
    CurrentUser,
    Message,
    SessionDep,
    User,
    UserCreate,
    UserPublic,
    UsersPublic,
    UserUpdate,
    create_user,
    get_user_by_email,
    update_user,
)
from backend.auth.deps import get_current_platform_admin
from backend.core.logging import get_logger

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(get_current_platform_admin)],
)
logger = get_logger(__name__)


@router.get("/", response_model=UsersPublic)
def read_users(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """Retrieve all users (admin only)."""
    count_statement = select(func.count()).select_from(User)
    count = session.exec(count_statement).one()

    statement = select(User).offset(skip).limit(limit)
    users = session.exec(statement).all()

    return UsersPublic(data=users, count=count)


@router.post("/", response_model=UserPublic)
async def create_user_admin(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    user_in: UserCreate,
) -> Any:
    """Create new user (admin only)."""
    user = get_user_by_email(session=session, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    user = create_user(session=session, user_create=user_in)
    logger.info("user_created_by_admin", email=user.email)

    await audit_service.log(
        AuditAction.USER_CREATED,
        actor=current_user,
        request=request,
        targets=[Target(type="user", id=str(user.id), name=user.email)],
        metadata={
            "created_by_admin": True,
            "admin_id": str(current_user.id),
            "admin_email": current_user.email,
            "new_user_email": user.email,
            "is_platform_admin": user.is_platform_admin,
        },
    )

    return user


@router.get("/{user_id}", response_model=UserPublic)
def read_user_by_id(
    user_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Get a specific user by id (admin only)."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.patch("/{user_id}", response_model=UserPublic)
async def update_user_admin(
    request: Request,
    user_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    user_in: UserUpdate,
) -> Any:
    """Update a user (admin only)."""
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user_in.email:
        existing_user = get_user_by_email(session=session, email=user_in.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists",
            )

    # Track changes for audit log
    old_values = {}
    new_values = {}
    user_data = user_in.model_dump(exclude_unset=True)
    for field, new_value in user_data.items():
        old_value = getattr(db_user, field, None)
        if old_value != new_value:
            old_values[field] = old_value
            new_values[field] = new_value

    db_user = update_user(session=session, db_user=db_user, user_in=user_in)

    if old_values:  # Only log if there were actual changes
        await audit_service.log(
            AuditAction.USER_PROFILE_UPDATED,
            actor=current_user,
            request=request,
            targets=[Target(type="user", id=str(user_id), name=db_user.email)],
            changes={"before": old_values, "after": new_values},
            metadata={
                "updated_by_admin": True,
                "admin_id": str(current_user.id),
                "admin_email": current_user.email,
                "fields_updated": list(new_values.keys()),
            },
        )

    return db_user


@router.delete("/{user_id}", response_model=Message)
async def delete_user(
    request: Request,
    user_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Delete a user (admin only)."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user == current_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Users cannot delete themselves",
        )

    # Capture user info before deletion
    deleted_user_email = user.email

    session.delete(user)
    session.commit()
    logger.info("user_deleted", user_id=str(user_id))

    await audit_service.log(
        AuditAction.USER_DELETED,
        actor=current_user,
        request=request,
        targets=[Target(type="user", id=str(user_id), name=deleted_user_email)],
        metadata={
            "deleted_by_admin": True,
            "admin_id": str(current_user.id),
            "admin_email": current_user.email,
            "deleted_user_email": deleted_user_email,
        },
    )

    return Message(message="User deleted successfully")
