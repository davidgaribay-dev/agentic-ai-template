import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from backend.conversations.models import Conversation
    from backend.invitations.models import Invitation
    from backend.organizations.models import Organization, OrganizationMember
    from backend.settings.models import TeamSettings


class TeamRole(str, Enum):
    """Team-level roles with hierarchical permissions.

    ADMIN: Full control over team, can manage members and all team resources
    MEMBER: Can create and manage own resources, view team resources
    VIEWER: Read-only access to team resources
    """

    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class TeamBase(SQLModel):
    name: str = Field(min_length=1, max_length=255, index=True)
    slug: str = Field(min_length=1, max_length=100, index=True)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = Field(default=None, max_length=500)


class Team(TeamBase, table=True):
    """Sub-group within an organization for resource isolation.
    Teams contain conversations, items, and other resources.
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", nullable=False, ondelete="CASCADE"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    created_by_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="SET NULL"
    )

    organization: "Organization" = Relationship(back_populates="teams")
    members: list["TeamMember"] = Relationship(
        back_populates="team",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    conversations: list["Conversation"] = Relationship(
        back_populates="team",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    invitations: list["Invitation"] = Relationship(
        back_populates="team",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    settings: "TeamSettings" = Relationship(
        back_populates="team",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )


class TeamCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class TeamUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class TeamPublic(TeamBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    created_by_id: uuid.UUID | None


class TeamsPublic(SQLModel):
    data: list[TeamPublic]
    count: int


class TeamMemberBase(SQLModel):
    role: TeamRole = Field(default=TeamRole.MEMBER)


class TeamMember(TeamMemberBase, table=True):
    """Team membership database model.

    Links organization members to teams with a specific role.
    Requires the user to first be a member of the organization.
    """

    __tablename__ = "team_member"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    team_id: uuid.UUID = Field(
        foreign_key="team.id", nullable=False, ondelete="CASCADE"
    )
    org_member_id: uuid.UUID = Field(
        foreign_key="organization_member.id", nullable=False, ondelete="CASCADE"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    team: Team = Relationship(back_populates="members")
    org_member: "OrganizationMember" = Relationship(back_populates="team_memberships")

    class Config:
        # Unique constraint: org member can only be member of team once
        table_args = {"unique_constraint": ["team_id", "org_member_id"]}


class TeamMemberCreate(SQLModel):
    org_member_id: uuid.UUID
    role: TeamRole = Field(default=TeamRole.MEMBER)


class TeamMemberUpdate(SQLModel):
    role: TeamRole | None = None


class TeamMemberPublic(SQLModel):
    id: uuid.UUID
    team_id: uuid.UUID
    org_member_id: uuid.UUID
    role: TeamRole
    created_at: datetime
    updated_at: datetime


class TeamMemberWithUser(TeamMemberPublic):
    user_id: uuid.UUID
    user_email: str
    user_full_name: str | None
    user_profile_image_url: str | None = None
    org_role: str 


class TeamMembersPublic(SQLModel):
    data: list[TeamMemberWithUser]
    count: int


from backend.conversations.models import Conversation  # noqa: E402, F401
from backend.invitations.models import Invitation  # noqa: E402, F401
from backend.organizations.models import Organization, OrganizationMember  # noqa: E402, F401
from backend.settings.models import TeamSettings  # noqa: E402, F401

Team.model_rebuild()
TeamMember.model_rebuild()
