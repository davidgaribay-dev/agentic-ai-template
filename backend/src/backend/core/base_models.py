"""Base models and mixins for SQLModel schemas.

This module provides reusable mixins and base classes to eliminate field duplication
across the codebase while maintaining consistency and scalability.

Usage:
    - Database models (table=True) inherit from composed base classes
    - Response schemas use TimestampResponseMixin for timestamp fields
    - List responses use PaginatedResponse[T] generic

Example:
    class Organization(OrganizationBase, TimestampedTable, table=True):
        ...

    class Team(TeamBase, AuditedTable, OrgScopedMixin, table=True):
        ...
"""

import uuid
from datetime import UTC, datetime
from typing import Generic, TypeVar

from sqlmodel import Field, SQLModel

T = TypeVar("T")


class UUIDPrimaryKeyMixin(SQLModel):
    """Standard UUID primary key for all models."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class TimestampMixin(SQLModel):
    """Created/updated timestamps for audit trail."""

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CreatedAtMixin(SQLModel):
    """Created timestamp only (for models without updated_at like Invitation)."""

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AuditMixin(SQLModel):
    """Track who created records. Optional at DB level for ondelete="SET NULL".

    Note: While nullable at the database level (to allow SET NULL on user deletion),
    this should be required at the API level when creating records.
    """

    created_by_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="SET NULL"
    )


class OptionalAuditMixin(SQLModel):
    """Track who created records. Optional field for backwards compatibility.

    Alias for AuditMixin - both use nullable=True with SET NULL.
    """

    created_by_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="SET NULL"
    )


class SoftDeleteMixin(SQLModel):
    """Soft delete support."""

    deleted_at: datetime | None = Field(default=None, nullable=True, index=True)


class OrgScopedMixin(SQLModel):
    """For models scoped to a single organization (required)."""

    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", nullable=False, ondelete="CASCADE", index=True
    )


class TeamScopedMixin(SQLModel):
    """For models scoped to a single team (required)."""

    team_id: uuid.UUID = Field(
        foreign_key="team.id", nullable=False, ondelete="CASCADE", index=True
    )


class UserScopedMixin(SQLModel):
    """For models scoped to a single user (required)."""

    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )


class HierarchicalScopedMixin(SQLModel):
    """For models with org/team/user hierarchy (all nullable, exactly one level set).

    Used by Prompt and Conversation where the scope level is determined by which
    fields are populated:
    - Org scope: organization_id set, team_id null, user_id null
    - Team scope: organization_id set, team_id set, user_id null
    - User scope: user_id set (organization_id and team_id may vary)
    """

    organization_id: uuid.UUID | None = Field(
        foreign_key="organization.id", nullable=True, ondelete="CASCADE", index=True
    )
    team_id: uuid.UUID | None = Field(
        foreign_key="team.id", nullable=True, ondelete="CASCADE", index=True
    )
    user_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="CASCADE", index=True
    )


class MCPScopedMixin(SQLModel):
    """For MCP models with org required, team/user optional.

    MCPServer has a unique pattern where organization_id is always required,
    but team_id and user_id are optional to indicate scope level:
    - Org scope: team_id null, user_id null
    - Team scope: team_id set, user_id null
    - User scope: team_id set, user_id set
    """

    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", nullable=False, ondelete="CASCADE"
    )
    team_id: uuid.UUID | None = Field(
        foreign_key="team.id", nullable=True, default=None, ondelete="CASCADE"
    )
    user_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, default=None, ondelete="CASCADE"
    )


class BaseTable(UUIDPrimaryKeyMixin):
    """Base for simple tables (ID only).

    Use for: User, Item (models without timestamps)
    """

    pass


class TimestampedTable(UUIDPrimaryKeyMixin, TimestampMixin):
    """Base for tables with timestamps.

    Use for: Organization, OrganizationMember, TeamMember, all Settings models
    """

    pass


class AuditedTable(UUIDPrimaryKeyMixin, TimestampMixin, AuditMixin):
    """Base for tables with full audit trail (required created_by).

    Use for: MCPServer (where created_by is always required)
    """

    pass


class OptionalAuditedTable(UUIDPrimaryKeyMixin, TimestampMixin, OptionalAuditMixin):
    """Base for tables with optional audit trail.

    Use for: Team, Prompt, Conversation (where created_by can be null)
    """

    pass


class TimestampResponseMixin(SQLModel):
    """For Public/Response schemas that include timestamps.

    Use in Public schemas to include created_at and updated_at fields.
    """

    created_at: datetime
    updated_at: datetime


class PaginatedResponse(SQLModel, Generic[T]):
    """Standard paginated response wrapper.

    Replaces individual *sPublic schemas (UsersPublic, TeamsPublic, etc.)
    with a consistent generic response format.

    Example:
        @router.get("/users", response_model=PaginatedResponse[UserPublic])
        def list_users(...):
            return PaginatedResponse(data=users, count=len(users))
    """

    data: list[T]
    count: int
