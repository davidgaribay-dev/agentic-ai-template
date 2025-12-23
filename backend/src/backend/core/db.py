from collections.abc import Generator
from typing import Any, TypeVar

from sqlalchemy.orm import InstrumentedAttribute
from sqlmodel import Session, SQLModel, create_engine, func, select
from sqlmodel.sql.expression import SelectOfScalar

from backend.core.config import settings

engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=settings.DEBUG and settings.ENVIRONMENT == "local",
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


T = TypeVar("T", bound=SQLModel)


def paginate(
    session: Session,
    statement: SelectOfScalar[T],
    model: type[T],
    skip: int = 0,
    limit: int = 100,
    order_by: InstrumentedAttribute[Any] | None = None,
) -> tuple[list[T], int]:
    """Execute a paginated query and return results with total count.

    This utility function handles the common pattern of:
    1. Counting total matching records
    2. Fetching a page of results with offset/limit

    Args:
        session: Database session
        statement: Base SQLModel select statement (without pagination)
        model: The SQLModel class being queried (for count query)
        skip: Number of records to skip (offset)
        limit: Maximum number of records to return
        order_by: Optional column to order by

    Returns:
        Tuple of (list of results, total count)

    Example:
        statement = select(User).where(User.is_active == True)
        users, total = paginate(session, statement, User, skip=0, limit=10)
    """
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    if order_by is not None:
        statement = statement.order_by(order_by)

    paginated_statement = statement.offset(skip).limit(limit)
    results = session.exec(paginated_statement).all()

    return list(results), count
