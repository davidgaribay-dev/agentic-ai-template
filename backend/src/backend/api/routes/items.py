import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth import CurrentUser, Message, SessionDep
from backend.auth.models import User
from backend.items import (
    Item,
    ItemCreate,
    ItemPublic,
    ItemsPublic,
    ItemUpdate,
    create_item,
    delete_item,
    get_item,
    get_items,
    get_items_by_owner,
    update_item,
)

router = APIRouter(prefix="/items", tags=["items"])


def get_item_with_owner_check(
    session: SessionDep,
    current_user: CurrentUser,
    item_id: Annotated[uuid.UUID, Path(description="Item UUID")],
) -> Item:
    """Get an item and verify the current user has access to it.

    Platform admins can access any item. Regular users can only access
    items they own.

    Raises:
        HTTPException: 404 if item not found, 403 if user doesn't have access
    """
    item = get_item(session=session, item_id=item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    if not current_user.is_platform_admin and item.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return item


VerifiedItem = Annotated[Item, Depends(get_item_with_owner_check)]


@router.get("/", response_model=ItemsPublic)
def read_items(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """Retrieve items.

    Platform admins can see all items, regular users only see their own.
    """
    if current_user.is_platform_admin:
        items, count = get_items(session=session, skip=skip, limit=limit)
    else:
        items, count = get_items_by_owner(
            session=session, owner_id=current_user.id, skip=skip, limit=limit
        )

    return ItemsPublic(data=items, count=count)


@router.post("/", response_model=ItemPublic)
async def create_item_endpoint(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    item_in: ItemCreate,
) -> Any:
    """Create new item for the current user."""
    item = create_item(session=session, item_in=item_in, owner_id=current_user.id)

    await audit_service.log(
        AuditAction.ITEM_CREATED,
        actor=current_user,
        request=request,
        targets=[Target(type="item", id=str(item.id), name=item.title)],
        metadata={
            "item_title": item.title,
            "item_description": item.description,
        },
    )

    return item


@router.get("/{item_id}", response_model=ItemPublic)
def read_item(item: VerifiedItem) -> Any:
    """Get item by ID.

    Users can only access their own items unless they are platform admins.
    """
    return item


@router.patch("/{item_id}", response_model=ItemPublic)
async def update_item_endpoint(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    item: VerifiedItem,
    item_in: ItemUpdate,
) -> Any:
    """Update an item.

    Users can only update their own items unless they are platform admins.
    """
    # Track changes for audit log
    old_values = {}
    new_values = {}
    item_data = item_in.model_dump(exclude_unset=True)
    for field, new_value in item_data.items():
        old_value = getattr(item, field, None)
        if old_value != new_value:
            old_values[field] = old_value
            new_values[field] = new_value

    updated_item = update_item(session=session, db_item=item, item_in=item_in)

    if old_values:  # Only log if there were actual changes
        await audit_service.log(
            AuditAction.ITEM_UPDATED,
            actor=current_user,
            request=request,
            targets=[Target(type="item", id=str(updated_item.id), name=updated_item.title)],
            changes={"before": old_values, "after": new_values},
            metadata={"fields_updated": list(new_values.keys())},
        )

    return updated_item


@router.delete("/{item_id}", response_model=Message)
async def delete_item_endpoint(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    item: VerifiedItem,
) -> Any:
    """Delete an item.

    Users can only delete their own items unless they are platform admins.
    """
    item_id = str(item.id)
    item_title = item.title

    delete_item(session=session, db_item=item)

    await audit_service.log(
        AuditAction.ITEM_DELETED,
        actor=current_user,
        request=request,
        targets=[Target(type="item", id=item_id, name=item_title)],
        metadata={"item_title": item_title},
    )

    return Message(message="Item deleted successfully")
