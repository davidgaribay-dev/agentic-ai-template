import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import (
    PaginatedResponse,
    TimestampedTable,
    TimestampResponseMixin,
)

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.invitations.models import Invitation
    from backend.settings.models import OrganizationSettings
    from backend.teams.models import Team, TeamMember
    from backend.theme_settings.models import OrganizationThemeSettings


class OrgRole(str, Enum):
    """Organization-level roles with hierarchical permissions.

    OWNER: Full control, can delete org, transfer ownership, manage billing
    ADMIN: Can manage members, teams, settings (but not delete org or transfer ownership)
    MEMBER: Basic access, can view org resources and participate in teams
    """

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class OrganizationBase(SQLModel):
    """Base organization schema with common fields."""

    name: str = Field(min_length=1, max_length=255, index=True)
    slug: str = Field(min_length=1, max_length=100, unique=True, index=True)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = Field(default=None, max_length=500)


class Organization(OrganizationBase, TimestampedTable, table=True):
    """Organization database model.

    Top-level tenant container that groups users and resources.
    Organizations contain teams, and all resources are scoped to org/team.
    """

    members: list["OrganizationMember"] = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    teams: list["Team"] = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    invitations: list["Invitation"] = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    settings: "OrganizationSettings" = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )
    theme_settings: "OrganizationThemeSettings" = Relationship(
        back_populates="organization",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )


class OrganizationCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class OrganizationUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class OrganizationPublic(OrganizationBase, TimestampResponseMixin):
    id: uuid.UUID


# OrganizationsPublic is now PaginatedResponse[OrganizationPublic]
OrganizationsPublic = PaginatedResponse[OrganizationPublic]


class OrganizationMemberBase(SQLModel):
    role: OrgRole = Field(default=OrgRole.MEMBER)


class OrganizationMember(OrganizationMemberBase, TimestampedTable, table=True):
    """Organization membership database model.

    Links users to organizations with a specific role.
    This is the primary way users gain access to organization resources.
    """

    __tablename__ = "organization_member"

    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", nullable=False, ondelete="CASCADE"
    )
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )

    organization: Organization = Relationship(back_populates="members")
    user: "User" = Relationship(back_populates="organization_memberships")

    team_memberships: list["TeamMember"] = Relationship(
        back_populates="org_member",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    class Config:
        """SQLModel config."""

        table_args = {"unique_constraint": ["organization_id", "user_id"]}


class OrganizationMemberCreate(SQLModel):
    user_id: uuid.UUID
    role: OrgRole = Field(default=OrgRole.MEMBER)


class OrganizationMemberUpdate(SQLModel):
    role: OrgRole | None = None


class OrganizationMemberPublic(TimestampResponseMixin):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    role: OrgRole


class OrganizationMemberWithUser(OrganizationMemberPublic):
    user_email: str
    user_full_name: str | None
    user_profile_image_url: str | None = None


# OrganizationMembersPublic is now PaginatedResponse[OrganizationMemberWithUser]
OrganizationMembersPublic = PaginatedResponse[OrganizationMemberWithUser]


from backend.invitations.models import Invitation  # noqa: E402, F401
from backend.settings.models import OrganizationSettings  # noqa: E402, F401
from backend.teams.models import Team, TeamMember  # noqa: E402, F401
from backend.theme_settings.models import OrganizationThemeSettings  # noqa: E402, F401

Organization.model_rebuild()
OrganizationMember.model_rebuild()
