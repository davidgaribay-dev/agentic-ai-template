"""Guardrails models for AI content filtering.

Provides hierarchical content filtering at org, team, and user levels.
"""

from datetime import UTC, datetime
from enum import Enum
import uuid

from pydantic import BaseModel, Field
from sqlalchemy import JSON, Column, Index
from sqlmodel import Field as SQLField
from sqlmodel import SQLModel


class GuardrailAction(str, Enum):
    """Action to take when a guardrail matches."""

    BLOCK = "block"  # Reject the message entirely
    WARN = "warn"  # Allow but log warning
    REDACT = "redact"  # Replace matched content with [REDACTED]


class GuardrailMatch(BaseModel):
    """Information about a guardrail match."""

    pattern: str
    pattern_type: str  # "keyword", "regex", or "pii"
    matched_text: str
    start: int
    end: int


class GuardrailResult(BaseModel):
    """Result of a guardrail check."""

    passed: bool
    action: GuardrailAction | None = None
    matches: list[GuardrailMatch] = []
    message: str | None = None
    redacted_content: str | None = None


# Helper functions to create JSON columns (avoids shared Column object issue)
def _json_column() -> Column:
    """Create a new JSON column for each field."""
    return Column(JSON, nullable=False, default=[])


class OrganizationGuardrails(SQLModel, table=True):
    """Organization-level guardrails configuration."""

    __tablename__ = "organization_guardrails"  # type: ignore[assignment]
    __table_args__ = (Index("idx_organization_guardrails_org_id", "organization_id"),)

    id: uuid.UUID = SQLField(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = SQLField(
        foreign_key="organization.id", unique=True, index=True
    )

    # Common guardrail settings
    guardrails_enabled: bool = SQLField(default=True)

    # Input guardrails (check user messages)
    input_blocked_keywords: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    input_blocked_patterns: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    input_action: GuardrailAction = SQLField(default=GuardrailAction.BLOCK)

    # Output guardrails (check LLM responses)
    output_blocked_keywords: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    output_blocked_patterns: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    output_action: GuardrailAction = SQLField(default=GuardrailAction.REDACT)

    # PII Detection
    pii_detection_enabled: bool = SQLField(default=False)
    pii_types: list[str] = SQLField(default_factory=list, sa_column=_json_column())
    pii_action: GuardrailAction = SQLField(default=GuardrailAction.REDACT)

    # Org-only settings - control inheritance
    allow_team_override: bool = SQLField(default=True)
    allow_user_override: bool = SQLField(default=True)

    created_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))


class TeamGuardrails(SQLModel, table=True):
    """Team-level guardrails configuration."""

    __tablename__ = "team_guardrails"  # type: ignore[assignment]
    __table_args__ = (Index("idx_team_guardrails_team_id", "team_id"),)

    id: uuid.UUID = SQLField(default_factory=uuid.uuid4, primary_key=True)
    team_id: uuid.UUID = SQLField(foreign_key="team.id", unique=True, index=True)

    # Common guardrail settings
    guardrails_enabled: bool = SQLField(default=True)

    # Input guardrails (check user messages)
    input_blocked_keywords: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    input_blocked_patterns: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    input_action: GuardrailAction = SQLField(default=GuardrailAction.BLOCK)

    # Output guardrails (check LLM responses)
    output_blocked_keywords: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    output_blocked_patterns: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    output_action: GuardrailAction = SQLField(default=GuardrailAction.REDACT)

    # PII Detection
    pii_detection_enabled: bool = SQLField(default=False)
    pii_types: list[str] = SQLField(default_factory=list, sa_column=_json_column())
    pii_action: GuardrailAction = SQLField(default=GuardrailAction.REDACT)

    created_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))


class UserGuardrails(SQLModel, table=True):
    """User-level guardrails configuration."""

    __tablename__ = "user_guardrails"  # type: ignore[assignment]
    __table_args__ = (Index("idx_user_guardrails_user_id", "user_id"),)

    id: uuid.UUID = SQLField(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = SQLField(foreign_key="user.id", unique=True, index=True)

    # Common guardrail settings
    guardrails_enabled: bool = SQLField(default=True)

    # Input guardrails (check user messages)
    input_blocked_keywords: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    input_blocked_patterns: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    input_action: GuardrailAction = SQLField(default=GuardrailAction.BLOCK)

    # Output guardrails (check LLM responses)
    output_blocked_keywords: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    output_blocked_patterns: list[str] = SQLField(
        default_factory=list, sa_column=_json_column()
    )
    output_action: GuardrailAction = SQLField(default=GuardrailAction.REDACT)

    # PII Detection
    pii_detection_enabled: bool = SQLField(default=False)
    pii_types: list[str] = SQLField(default_factory=list, sa_column=_json_column())
    pii_action: GuardrailAction = SQLField(default=GuardrailAction.REDACT)

    created_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))


# Pydantic models for API
class OrganizationGuardrailsCreate(BaseModel):
    """Schema for creating org guardrails."""

    guardrails_enabled: bool = True
    input_blocked_keywords: list[str] = Field(default_factory=list)
    input_blocked_patterns: list[str] = Field(default_factory=list)
    input_action: GuardrailAction = GuardrailAction.BLOCK
    output_blocked_keywords: list[str] = Field(default_factory=list)
    output_blocked_patterns: list[str] = Field(default_factory=list)
    output_action: GuardrailAction = GuardrailAction.REDACT
    pii_detection_enabled: bool = False
    pii_types: list[str] = Field(default_factory=list)
    pii_action: GuardrailAction = GuardrailAction.REDACT
    allow_team_override: bool = True
    allow_user_override: bool = True


class OrganizationGuardrailsUpdate(BaseModel):
    """Schema for updating org guardrails."""

    guardrails_enabled: bool | None = None
    input_blocked_keywords: list[str] | None = None
    input_blocked_patterns: list[str] | None = None
    input_action: GuardrailAction | None = None
    output_blocked_keywords: list[str] | None = None
    output_blocked_patterns: list[str] | None = None
    output_action: GuardrailAction | None = None
    pii_detection_enabled: bool | None = None
    pii_types: list[str] | None = None
    pii_action: GuardrailAction | None = None
    allow_team_override: bool | None = None
    allow_user_override: bool | None = None


class OrganizationGuardrailsPublic(BaseModel):
    """Public schema for org guardrails."""

    id: uuid.UUID
    organization_id: uuid.UUID
    guardrails_enabled: bool
    input_blocked_keywords: list[str]
    input_blocked_patterns: list[str]
    input_action: GuardrailAction
    output_blocked_keywords: list[str]
    output_blocked_patterns: list[str]
    output_action: GuardrailAction
    pii_detection_enabled: bool
    pii_types: list[str]
    pii_action: GuardrailAction
    allow_team_override: bool
    allow_user_override: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TeamGuardrailsCreate(BaseModel):
    """Schema for creating team guardrails."""

    guardrails_enabled: bool = True
    input_blocked_keywords: list[str] = Field(default_factory=list)
    input_blocked_patterns: list[str] = Field(default_factory=list)
    input_action: GuardrailAction = GuardrailAction.BLOCK
    output_blocked_keywords: list[str] = Field(default_factory=list)
    output_blocked_patterns: list[str] = Field(default_factory=list)
    output_action: GuardrailAction = GuardrailAction.REDACT
    pii_detection_enabled: bool = False
    pii_types: list[str] = Field(default_factory=list)
    pii_action: GuardrailAction = GuardrailAction.REDACT


class TeamGuardrailsUpdate(BaseModel):
    """Schema for updating team guardrails."""

    guardrails_enabled: bool | None = None
    input_blocked_keywords: list[str] | None = None
    input_blocked_patterns: list[str] | None = None
    input_action: GuardrailAction | None = None
    output_blocked_keywords: list[str] | None = None
    output_blocked_patterns: list[str] | None = None
    output_action: GuardrailAction | None = None
    pii_detection_enabled: bool | None = None
    pii_types: list[str] | None = None
    pii_action: GuardrailAction | None = None


class TeamGuardrailsPublic(BaseModel):
    """Public schema for team guardrails."""

    id: uuid.UUID
    team_id: uuid.UUID
    guardrails_enabled: bool
    input_blocked_keywords: list[str]
    input_blocked_patterns: list[str]
    input_action: GuardrailAction
    output_blocked_keywords: list[str]
    output_blocked_patterns: list[str]
    output_action: GuardrailAction
    pii_detection_enabled: bool
    pii_types: list[str]
    pii_action: GuardrailAction
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserGuardrailsCreate(BaseModel):
    """Schema for creating user guardrails."""

    guardrails_enabled: bool = True
    input_blocked_keywords: list[str] = Field(default_factory=list)
    input_blocked_patterns: list[str] = Field(default_factory=list)
    input_action: GuardrailAction = GuardrailAction.BLOCK
    output_blocked_keywords: list[str] = Field(default_factory=list)
    output_blocked_patterns: list[str] = Field(default_factory=list)
    output_action: GuardrailAction = GuardrailAction.REDACT
    pii_detection_enabled: bool = False
    pii_types: list[str] = Field(default_factory=list)
    pii_action: GuardrailAction = GuardrailAction.REDACT


class UserGuardrailsUpdate(BaseModel):
    """Schema for updating user guardrails."""

    guardrails_enabled: bool | None = None
    input_blocked_keywords: list[str] | None = None
    input_blocked_patterns: list[str] | None = None
    input_action: GuardrailAction | None = None
    output_blocked_keywords: list[str] | None = None
    output_blocked_patterns: list[str] | None = None
    output_action: GuardrailAction | None = None
    pii_detection_enabled: bool | None = None
    pii_types: list[str] | None = None
    pii_action: GuardrailAction | None = None


class UserGuardrailsPublic(BaseModel):
    """Public schema for user guardrails."""

    id: uuid.UUID
    user_id: uuid.UUID
    guardrails_enabled: bool
    input_blocked_keywords: list[str]
    input_blocked_patterns: list[str]
    input_action: GuardrailAction
    output_blocked_keywords: list[str]
    output_blocked_patterns: list[str]
    output_action: GuardrailAction
    pii_detection_enabled: bool
    pii_types: list[str]
    pii_action: GuardrailAction
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EffectiveGuardrails(BaseModel):
    """Computed effective guardrails after applying hierarchy."""

    guardrails_enabled: bool
    guardrails_disabled_by: str | None = None  # "org", "team", or None

    # Input guardrails (merged from all levels)
    input_blocked_keywords: list[str]
    input_blocked_patterns: list[str]
    input_action: GuardrailAction  # Most restrictive wins

    # Output guardrails (merged from all levels)
    output_blocked_keywords: list[str]
    output_blocked_patterns: list[str]
    output_action: GuardrailAction  # Most restrictive wins

    # PII Detection
    pii_detection_enabled: bool
    pii_types: list[str]
    pii_action: GuardrailAction

    # Whether user can modify guardrails
    can_user_modify: bool = True


class GuardrailsTestRequest(BaseModel):
    """Request schema for testing guardrails."""

    content: str
    direction: str = Field(pattern="^(input|output)$")


class GuardrailsTestResponse(BaseModel):
    """Response schema for testing guardrails."""

    passed: bool
    action: GuardrailAction | None = None
    matches: list[GuardrailMatch] = []
    redacted_content: str | None = None
