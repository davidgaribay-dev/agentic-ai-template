from enum import Enum
from typing import TYPE_CHECKING, Optional
import uuid

from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import (
    HierarchicalScopedMixin,
    OptionalAuditedTable,
    PaginatedResponse,
    TimestampResponseMixin,
)

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.organizations.models import Organization
    from backend.teams.models import Team


class PromptType(str, Enum):
    """Type of prompt.

    TEMPLATE: Reusable text snippets users can insert into messages
    SYSTEM: Instructions that configure the AI agent's behavior
    """

    TEMPLATE = "template"
    SYSTEM = "system"


class PromptBase(SQLModel):
    """Base prompt schema with common fields."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    content: str = Field(min_length=1)
    prompt_type: PromptType = Field(default=PromptType.TEMPLATE)


class Prompt(PromptBase, OptionalAuditedTable, HierarchicalScopedMixin, table=True):
    """Prompt database model.

    Stores prompt templates and system prompts with hierarchical scoping.

    Scope levels (from HierarchicalScopedMixin, exactly one scope field should be set):
    - Organization scope: organization_id set, team_id and user_id null
    - Team scope: organization_id and team_id set, user_id null
    - User scope: user_id set, organization_id and team_id null (global to user)

    For system prompts, only one can be active per scope level.
    When the agent runs, active system prompts are concatenated:
    org prompt + team prompt + user prompt
    """

    # For system prompts: is this the active one for this scope?
    is_active: bool = Field(default=False, index=True)

    # Relationships
    organization: Optional["Organization"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Prompt.organization_id]"}
    )
    team: Optional["Team"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Prompt.team_id]"}
    )
    user: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Prompt.user_id]"}
    )
    created_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Prompt.created_by_id]"}
    )


class PromptCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    content: str = Field(min_length=1)
    prompt_type: PromptType = Field(default=PromptType.TEMPLATE)


class PromptUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    content: str | None = Field(default=None, min_length=1)


class PromptPublic(PromptBase, TimestampResponseMixin):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    team_id: uuid.UUID | None
    user_id: uuid.UUID | None
    is_active: bool
    created_by_id: uuid.UUID | None


# PromptsPublic is now PaginatedResponse[PromptPublic]
PromptsPublic = PaginatedResponse[PromptPublic]


class PromptsAvailable(SQLModel):
    """
    Returns all prompts a user can access in their current org/team context,
    grouped by scope level.
    """

    org_prompts: list[PromptPublic]
    team_prompts: list[PromptPublic]
    user_prompts: list[PromptPublic]


class ActiveSystemPrompt(SQLModel):
    """Schema for the effective system prompt.

    Returns the concatenated active system prompts from all levels.
    """

    content: str
    org_prompt: PromptPublic | None = None
    team_prompt: PromptPublic | None = None
    user_prompt: PromptPublic | None = None


# Forward reference resolution

Prompt.model_rebuild()
