import uuid

from sqlmodel import Session, select

from backend.auth.models import User, UserCreate, UserUpdate
from backend.core.security import get_password_hash, verify_password


def create_user(*, session: Session, user_create: UserCreate) -> User:
    """Create a new user in the database.

    Args:
        session: Database session
        user_create: User creation data

    Returns:
        Created user object
    """
    db_obj = User.model_validate(
        user_create,
        update={"hashed_password": get_password_hash(user_create.password)},
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> User:
    """Update a user in the database.

    Args:
        session: Database session
        db_user: Existing user object
        user_in: Update data

    Returns:
        Updated user object
    """
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data.pop("password")
        extra_data["hashed_password"] = get_password_hash(password)

    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    """Get a user by email address.

    Args:
        session: Database session
        email: User's email address

    Returns:
        User object if found, None otherwise
    """
    statement = select(User).where(User.email == email)
    return session.exec(statement).first()


def get_user_by_id(*, session: Session, user_id: uuid.UUID) -> User | None:
    """Get a user by ID.

    Args:
        session: Database session
        user_id: User's UUID

    Returns:
        User object if found, None otherwise
    """
    return session.get(User, user_id)


# Dummy hash for timing-safe authentication when user doesn't exist
# This is a valid bcrypt hash that will always fail verification
# but takes the same time as a real verification
_DUMMY_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VIiOMjKQBNHxMK"


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    """Authenticate a user by email and password.

    This function is designed to be timing-safe to prevent user enumeration
    attacks. It always performs a password verification operation regardless
    of whether the user exists.

    Args:
        session: Database session
        email: User's email address
        password: User's password

    Returns:
        User object if credentials are valid, None otherwise
    """
    db_user = get_user_by_email(session=session, email=email)

    if not db_user:
        # Perform dummy password check to prevent timing attacks
        # This ensures the response time is consistent whether the user exists or not
        verify_password(password, _DUMMY_HASH)
        return None

    if not verify_password(password, db_user.hashed_password):
        return None

    return db_user
