import uuid

from sqlmodel import Session, func, select

from backend.items.models import Item, ItemCreate, ItemUpdate


def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    """Create a new item in the database.

    Args:
        session: Database session
        item_in: Item creation data
        owner_id: UUID of the item owner

    Returns:
        Created item object
    """
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


def get_item(*, session: Session, item_id: uuid.UUID) -> Item | None:
    """Get an item by ID.

    Args:
        session: Database session
        item_id: Item's UUID

    Returns:
        Item object if found, None otherwise
    """
    return session.get(Item, item_id)


def get_items(
    *, session: Session, skip: int = 0, limit: int = 100
) -> tuple[list[Item], int]:
    """Get all items with pagination.

    Args:
        session: Database session
        skip: Number of items to skip
        limit: Maximum number of items to return

    Returns:
        Tuple of (list of items, total count)
    """
    count_statement = select(func.count()).select_from(Item)
    count = session.exec(count_statement).one()

    statement = select(Item).offset(skip).limit(limit)
    items = session.exec(statement).all()

    return list(items), count


def get_items_by_owner(
    *, session: Session, owner_id: uuid.UUID, skip: int = 0, limit: int = 100
) -> tuple[list[Item], int]:
    """Get items owned by a specific user with pagination.

    Args:
        session: Database session
        owner_id: UUID of the item owner
        skip: Number of items to skip
        limit: Maximum number of items to return

    Returns:
        Tuple of (list of items, total count)
    """
    count_statement = (
        select(func.count()).select_from(Item).where(Item.owner_id == owner_id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(Item).where(Item.owner_id == owner_id).offset(skip).limit(limit)
    )
    items = session.exec(statement).all()

    return list(items), count


def update_item(*, session: Session, db_item: Item, item_in: ItemUpdate) -> Item:
    """Update an item in the database.

    Args:
        session: Database session
        db_item: Existing item object
        item_in: Update data

    Returns:
        Updated item object
    """
    item_data = item_in.model_dump(exclude_unset=True)
    db_item.sqlmodel_update(item_data)
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


def delete_item(*, session: Session, db_item: Item) -> None:
    """Delete an item from the database.

    Args:
        session: Database session
        db_item: Item object to delete
    """
    session.delete(db_item)
    session.commit()
