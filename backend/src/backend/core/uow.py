"""Unit of Work pattern for atomic database operations.

Provides transaction management with automatic commit/rollback,
ensuring related database operations succeed or fail together.

Based on patterns from Cosmic Python:
https://www.cosmicpython.com/book/chapter_06_uow.html
"""

from collections.abc import Callable, Generator
from contextlib import contextmanager
import functools
import inspect
from typing import Any, TypeVar

from sqlmodel import Session

from backend.core.db import engine
from backend.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


class UnitOfWork:
    """Manages a database transaction.

    Wraps a SQLModel session and provides explicit commit/rollback control.
    Use with the `atomic()` context manager for automatic handling.

    Attributes:
        session: The underlying SQLModel session
    """

    def __init__(self, session: Session):
        self._session = session
        self._committed = False

    @property
    def session(self) -> Session:
        """Access the underlying session for queries."""
        return self._session

    def commit(self) -> None:
        """Commit the transaction.

        Should only be called once. Subsequent calls are no-ops.
        """
        if not self._committed:
            self._session.commit()
            self._committed = True
            logger.debug("uow_committed")

    def rollback(self) -> None:
        """Rollback the transaction.

        Safe to call multiple times or after commit.
        """
        if not self._committed:
            self._session.rollback()
            logger.debug("uow_rolled_back")

    def flush(self) -> None:
        """Flush pending changes to the database without committing.

        Useful for getting auto-generated IDs before commit.
        """
        self._session.flush()


@contextmanager
def atomic(
    session: Session | None = None,
) -> Generator[UnitOfWork, None, None]:
    """Context manager for atomic database operations.

    Ensures all database operations within the block either
    succeed together or are rolled back together.

    Args:
        session: Optional existing session. If None, creates a new one.

    Yields:
        UnitOfWork instance for the transaction

    Usage:
        with atomic(session) as uow:
            team = Team(name=name, organization_id=org_id)
            uow.session.add(team)
            uow.session.flush()  # Get team.id

            member = TeamMember(team_id=team.id, ...)
            uow.session.add(member)
            # Commits automatically on success

        # Or without an existing session:
        with atomic() as uow:
            ...
    """
    owns_session = session is None
    active_session = Session(engine) if owns_session else session
    assert active_session is not None  # for type narrowing

    uow = UnitOfWork(active_session)

    try:
        yield uow
        uow.commit()
    except Exception:
        uow.rollback()
        raise
    finally:
        if owns_session:
            active_session.close()


@contextmanager
def read_only(
    session: Session | None = None,
) -> Generator[Session, None, None]:
    """Context manager for read-only database operations.

    Similar to atomic() but never commits. Use for queries
    that don't modify data.

    Args:
        session: Optional existing session. If None, creates a new one.

    Yields:
        Session for read operations
    """
    owns_session = session is None
    active_session = Session(engine) if owns_session else session
    assert active_session is not None  # for type narrowing

    try:
        yield active_session
    finally:
        active_session.rollback()  # Ensure no accidental commits
        if owns_session:
            active_session.close()


def transactional(func: Callable[..., T]) -> Callable[..., T]:
    """Decorator to wrap a function in a transaction.

    The decorated function receives a `session` parameter if it doesn't
    already have one. The transaction is committed on success or
    rolled back on exception.

    Usage:
        @transactional
        def create_team_with_member(name: str, org_id: UUID, creator_id: UUID, session: Session):
            team = Team(name=name, organization_id=org_id)
            session.add(team)
            session.flush()

            member = TeamMember(team_id=team.id, org_member_id=creator_id)
            session.add(member)
            return team
    """
    sig = inspect.signature(func)

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> T:
        # Check if session was provided
        bound = sig.bind_partial(*args, **kwargs)

        if "session" in bound.arguments:
            # Session provided, just call the function
            return func(*args, **kwargs)

        # No session, wrap in transaction
        with atomic() as uow:
            kwargs["session"] = uow.session
            return func(*args, **kwargs)

    return wrapper


class BulkOperations:
    """Utilities for efficient bulk database operations."""

    @staticmethod
    def bulk_insert(session: Session, objects: list[T]) -> None:
        """Insert multiple objects efficiently.

        Args:
            session: Database session
            objects: List of SQLModel objects to insert
        """
        session.add_all(objects)

    @staticmethod
    def bulk_update(session: Session, objects: list[T]) -> None:
        """Update multiple objects efficiently.

        Note: Objects must already be attached to the session
        (fetched from DB or added previously).

        Args:
            session: Database session
            objects: List of modified SQLModel objects (tracked by session)
        """
        # SQLModel/SQLAlchemy tracks changes automatically
        # Just flush to send updates
        session.flush()
