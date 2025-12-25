from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    """Return current UTC datetime. Used as default_factory for Pydantic fields."""
    return datetime.now(UTC)


class LogLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AuditAction(str, Enum):
    """Predefined audit actions for consistency and queryability.

    Naming convention: {resource}.{action}
    """

    # Authentication events
    USER_LOGIN_SUCCESS = "user.login.success"
    USER_LOGIN_FAILED = "user.login.failed"
    USER_LOGOUT = "user.logout"
    USER_SIGNUP = "user.signup"
    USER_SIGNUP_WITH_INVITATION = "user.signup.with_invitation"
    USER_PASSWORD_CHANGED = "user.password.changed"
    USER_PASSWORD_CHANGE_FAILED = "user.password.change_failed"
    USER_PASSWORD_RESET_REQUESTED = "user.password.reset_requested"
    USER_PASSWORD_RESET_COMPLETED = "user.password.reset_completed"
    USER_PASSWORD_RESET_FAILED = "user.password.reset_failed"
    USER_PROFILE_UPDATED = "user.profile.updated"
    USER_PROFILE_IMAGE_UPLOADED = "user.profile_image.uploaded"
    USER_PROFILE_IMAGE_DELETED = "user.profile_image.deleted"
    USER_DELETED = "user.deleted"
    USER_CREATED = "user.created"  # Admin creates user

    # Organization events
    ORG_CREATED = "organization.created"
    ORG_UPDATED = "organization.updated"
    ORG_DELETED = "organization.deleted"
    ORG_LOGO_UPLOADED = "organization.logo.uploaded"
    ORG_LOGO_DELETED = "organization.logo.deleted"
    ORG_MEMBER_INVITED = "organization.member.invited"
    ORG_MEMBER_JOINED = "organization.member.joined"
    ORG_MEMBER_REMOVED = "organization.member.removed"
    ORG_MEMBER_ROLE_CHANGED = "organization.member.role_changed"
    ORG_MEMBER_LEFT = "organization.member.left"
    ORG_OWNERSHIP_TRANSFERRED = "organization.ownership.transferred"

    # Team events
    TEAM_CREATED = "team.created"
    TEAM_UPDATED = "team.updated"
    TEAM_DELETED = "team.deleted"
    TEAM_LOGO_UPLOADED = "team.logo.uploaded"
    TEAM_LOGO_DELETED = "team.logo.deleted"
    TEAM_MEMBER_ADDED = "team.member.added"
    TEAM_MEMBER_REMOVED = "team.member.removed"
    TEAM_MEMBER_ROLE_CHANGED = "team.member.role_changed"
    TEAM_MEMBER_LEFT = "team.member.left"

    # Invitation events
    INVITATION_CREATED = "invitation.created"
    INVITATION_ACCEPTED = "invitation.accepted"
    INVITATION_REVOKED = "invitation.revoked"
    INVITATION_RESENT = "invitation.resent"

    # Conversation events
    CONVERSATION_CREATED = "conversation.created"
    CONVERSATION_UPDATED = "conversation.updated"
    CONVERSATION_DELETED = "conversation.deleted"
    CONVERSATION_STARRED = "conversation.starred"
    CONVERSATION_UNSTARRED = "conversation.unstarred"

    # AI Agent events
    AGENT_CHAT_STARTED = "agent.chat.started"
    AGENT_CHAT_COMPLETED = "agent.chat.completed"
    AGENT_CHAT_FAILED = "agent.chat.failed"
    AGENT_TOOL_INVOKED = "agent.tool.invoked"

    # API Key events (never log the actual key!)
    API_KEY_CREATED = "api_key.created"
    API_KEY_DELETED = "api_key.deleted"
    API_KEY_ROTATED = "api_key.rotated"
    DEFAULT_PROVIDER_CHANGED = "config.default_provider.changed"

    # Item events (generic resource)
    ITEM_CREATED = "item.created"
    ITEM_UPDATED = "item.updated"
    ITEM_DELETED = "item.deleted"

    # Prompt events
    PROMPT_CREATED = "prompt.created"
    PROMPT_UPDATED = "prompt.updated"
    PROMPT_DELETED = "prompt.deleted"
    PROMPT_ACTIVATED = "prompt.activated"
    PROMPT_DEACTIVATED = "prompt.deactivated"

    # Settings events
    ORG_SETTINGS_UPDATED = "organization.settings.updated"
    TEAM_SETTINGS_UPDATED = "team.settings.updated"
    USER_SETTINGS_UPDATED = "user.settings.updated"

    # MCP Server events
    MCP_SERVER_CREATED = "mcp_server.created"
    MCP_SERVER_UPDATED = "mcp_server.updated"
    MCP_SERVER_DELETED = "mcp_server.deleted"

    # Tool approval events
    TOOL_APPROVAL_REQUESTED = "tool.approval.requested"
    TOOL_APPROVAL_GRANTED = "tool.approval.granted"
    TOOL_APPROVAL_DENIED = "tool.approval.denied"


class Actor(BaseModel):
    id: UUID | None = None
    email: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None


class Target(BaseModel):
    type: str
    id: str | None = None
    name: str | None = None


class AuditEvent(BaseModel):
    """Audit log event structure.

    Follows the OCSF (Open Cybersecurity Schema Framework) inspired format
    for compatibility with SIEM systems.

    Includes i18n support with dual-language storage:
    - action_message_en: English canonical message (for search/compliance)
    - action_message_localized: Translated message (for UI display)
    """

    # Event identification
    id: str = Field(description="Unique event identifier (UUID)")
    timestamp: datetime = Field(default_factory=_utc_now)
    version: str = Field(default="1.0", description="Schema version")

    # What happened
    action: str = Field(description="The action that occurred")
    category: str = Field(default="audit", description="Event category: audit or app")
    outcome: str = Field(default="success", description="success, failure, or unknown")
    severity: LogLevel = Field(default=LogLevel.INFO)

    # i18n support
    locale: str = Field(default="en", description="Actor's preferred language (BCP 47)")
    action_key: str | None = Field(
        default=None, description="Translation key for action description"
    )
    action_message_en: str | None = Field(
        default=None, description="English canonical action description"
    )
    action_message_localized: str | None = Field(
        default=None, description="Translated action description (actor's language)"
    )

    # Who did it
    actor: Actor = Field(default_factory=Actor)

    # What was affected
    targets: list[Target] = Field(default_factory=list)

    # Multi-tenant context
    organization_id: UUID | None = None
    team_id: UUID | None = None

    # Request context
    request_id: str | None = None
    session_id: str | None = None

    # Additional details
    metadata: dict[str, Any] = Field(default_factory=dict)
    changes: dict[str, Any] | None = Field(
        default=None, description="Before/after for update operations"
    )

    # Error details (for failures)
    error_code: str | None = None
    error_message: str | None = None


class AppLogEvent(BaseModel):
    """Application log event for operational monitoring.

    Separate from audit logs for performance and different retention policies.

    Includes i18n support with dual-language storage for log messages.
    """

    id: str
    timestamp: datetime = Field(default_factory=_utc_now)
    level: LogLevel
    logger: str
    message: str

    # i18n support
    locale: str = Field(default="en", description="Request locale (BCP 47)")
    message_key: str | None = Field(
        default=None, description="Translation key for log message"
    )
    message_en: str | None = Field(
        default=None, description="English canonical message"
    )
    message_localized: str | None = Field(
        default=None, description="Translated message (if different from English)"
    )

    # Context
    request_id: str | None = None
    organization_id: UUID | None = None
    team_id: UUID | None = None
    user_id: UUID | None = None

    # Technical details
    module: str | None = None
    function: str | None = None
    line_number: int | None = None

    # Exception info
    exception_type: str | None = None
    exception_message: str | None = None
    stack_trace: str | None = None

    # Performance
    duration_ms: float | None = None

    # Additional context
    extra: dict[str, Any] = Field(default_factory=dict)


class AuditLogQuery(BaseModel):
    # Time range
    start_time: datetime | None = None
    end_time: datetime | None = None

    # Filters
    actions: list[str] | None = None
    actor_id: UUID | None = None
    actor_email: str | None = None
    organization_id: UUID | None = None
    team_id: UUID | None = None
    target_type: str | None = None
    target_id: str | None = None
    outcome: str | None = None

    # Full-text search
    query: str | None = None

    # Pagination
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=1000)

    # Sorting - validated to prevent injection
    sort_field: Literal[
        "timestamp",
        "action",
        "outcome",
        "actor_email",
        "duration_ms",
    ] = "timestamp"
    sort_order: Literal["asc", "desc"] = "desc"


class AuditLogResponse(BaseModel):
    events: list[AuditEvent]
    total: int
    skip: int
    limit: int
