from typing import TYPE_CHECKING
import uuid

from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import BaseTable, PaginatedResponse

if TYPE_CHECKING:
    from backend.auth.models import User


class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class Item(ItemBase, BaseTable, table=True):
    # Using owner_id instead of user_id for backwards compatibility
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: "User" = Relationship(back_populates="items")


class ItemCreate(ItemBase):
    pass


class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


# ItemsPublic is now PaginatedResponse[ItemPublic] - use it directly in routes
ItemsPublic = PaginatedResponse[ItemPublic]


Item.model_rebuild()
