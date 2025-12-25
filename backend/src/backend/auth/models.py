from datetime import datetime
from typing import TYPE_CHECKING
import uuid

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import BaseTable, PaginatedResponse

if TYPE_CHECKING:
    from backend.conversations.models import Conversation
    from backend.invitations.models import Invitation
    from backend.items.models import Item
    from backend.organizations.models import OrganizationMember
    from backend.rag_settings.models import UserRAGSettings
    from backend.settings.models import UserSettings
    from backend.theme_settings.models import UserThemeSettings


# Number of recent passwords to check for reuse prevention
PASSWORD_HISTORY_LIMIT = 5


class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_platform_admin: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    profile_image_url: str | None = Field(default=None, max_length=500)
    # User's preferred language (BCP 47 code, e.g., "en", "es", "zh")
    language: str = Field(default="en", max_length=10)


class User(UserBase, BaseTable, table=True):
    hashed_password: str
    # Only set explicitly on password change operations, not on every model load
    password_changed_at: datetime | None = Field(default=None)

    items: list["Item"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    conversations: list["Conversation"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "foreign_keys": "[Conversation.user_id]",
        },
    )

    organization_memberships: list["OrganizationMember"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    sent_invitations: list["Invitation"] = Relationship(
        back_populates="invited_by",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    settings: "UserSettings" = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )

    theme_settings: "UserThemeSettings" = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )

    rag_settings: "UserRAGSettings" = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )

    password_history: list["PasswordHistory"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class PasswordHistory(SQLModel, table=True):
    """Stores hashed passwords to prevent reuse.

    Keeps the last PASSWORD_HISTORY_LIMIT passwords per user.
    """

    __tablename__ = "password_history"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.now)

    user: "User" = Relationship(back_populates="password_history")


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    """Schema for user registration (public endpoint).

    When a user registers without an invitation, they create a new organization
    and become its owner.
    """

    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)

    organization_name: str | None = Field(default=None, max_length=255)


class UserRegisterWithInvitation(SQLModel):
    token: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    language: str | None = Field(default=None, max_length=10)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserPublic(UserBase):
    id: uuid.UUID


# UsersPublic is now PaginatedResponse[UserPublic] - use it directly in routes
UsersPublic = PaginatedResponse[UserPublic]


class Token(SQLModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # Access token expiry in seconds


class TokenPayload(SQLModel):
    sub: str | None = None
    type: str = "access"  # "access" or "refresh"
    jti: str | None = None  # JWT ID for token revocation


class RefreshTokenRequest(SQLModel):
    refresh_token: str


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class Message(SQLModel):
    message: str


User.model_rebuild()
