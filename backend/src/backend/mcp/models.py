"""MCP Server models and schemas."""

from enum import Enum
from typing import TYPE_CHECKING, Optional
import uuid

from pydantic import field_validator
from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import (
    AuditedTable,
    MCPScopedMixin,
    PaginatedResponse,
    TimestampResponseMixin,
)

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.organizations.models import Organization
    from backend.teams.models import Team


class MCPTransport(str, Enum):
    """Supported MCP transport types."""

    HTTP = "http"
    SSE = "sse"
    STREAMABLE_HTTP = "streamable_http"


class MCPAuthType(str, Enum):
    """Supported authentication types for MCP servers."""

    NONE = "none"
    BEARER = "bearer"
    API_KEY = "api_key"


class MCPServer(AuditedTable, MCPScopedMixin, table=True):
    """MCP Server registry model.

    Servers can be scoped to (via MCPScopedMixin - org always required):
    - Organization level (team_id=NULL, user_id=NULL): Available to all org members
    - Team level (team_id set, user_id=NULL): Available to team members only
    - User level (team_id set, user_id set): Personal server for specific user

    The settings hierarchy (org > team > user) controls whether MCP is enabled
    and whether custom servers can be added at each level.
    """

    __tablename__ = "mcp_server"

    # Server identification
    name: str = Field(max_length=100)
    description: str | None = Field(max_length=500, nullable=True, default=None)

    # Connection details
    url: str = Field(max_length=2048)
    transport: str = Field(default=MCPTransport.HTTP.value)

    # Authentication
    auth_type: str = Field(default=MCPAuthType.NONE.value)
    auth_header_name: str | None = Field(max_length=100, nullable=True, default=None)
    auth_secret_ref: str | None = Field(max_length=255, nullable=True, default=None)

    # Configuration
    enabled: bool = Field(default=True)
    is_builtin: bool = Field(default=False)
    tool_prefix: bool = Field(default=True)

    # Relationships
    organization: Optional["Organization"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[MCPServer.organization_id]"}
    )
    team: Optional["Team"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[MCPServer.team_id]"}
    )
    owner: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[MCPServer.user_id]"}
    )
    created_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[MCPServer.created_by_id]"}
    )

    @property
    def scope(self) -> str:
        """Get the scope level of this server."""
        if self.user_id:
            return "user"
        if self.team_id:
            return "team"
        return "org"


class MCPServerCreate(SQLModel):
    """Schema for creating an MCP server."""

    name: str = Field(max_length=100)
    description: str | None = Field(max_length=500, default=None)
    url: str = Field(max_length=2048)
    transport: MCPTransport = MCPTransport.HTTP
    auth_type: MCPAuthType = MCPAuthType.NONE
    auth_header_name: str | None = Field(max_length=100, default=None)
    auth_secret: str | None = Field(default=None, exclude=True)
    enabled: bool = True
    tool_prefix: bool = True

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Validate URL format and protocol."""
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    @field_validator("auth_header_name")
    @classmethod
    def validate_auth_header(cls, v: str | None, info) -> str | None:
        """Require auth_header_name when auth_type is not none."""
        if info.data.get("auth_type") != MCPAuthType.NONE and not v:
            raise ValueError("auth_header_name is required when auth_type is set")
        return v


class MCPServerUpdate(SQLModel):
    """Schema for updating an MCP server."""

    name: str | None = Field(max_length=100, default=None)
    description: str | None = Field(max_length=500, default=None)
    url: str | None = Field(max_length=2048, default=None)
    transport: MCPTransport | None = None
    auth_type: MCPAuthType | None = None
    auth_header_name: str | None = Field(max_length=100, default=None)
    auth_secret: str | None = Field(default=None, exclude=True)
    enabled: bool | None = None
    tool_prefix: bool | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str | None) -> str | None:
        """Validate URL format and protocol."""
        if v is None:
            return v
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class MCPServerPublic(TimestampResponseMixin):
    """Public schema for MCP server responses."""

    id: uuid.UUID
    organization_id: uuid.UUID
    team_id: uuid.UUID | None
    user_id: uuid.UUID | None
    name: str
    description: str | None
    url: str
    transport: str
    auth_type: str
    auth_header_name: str | None
    has_auth_secret: bool
    enabled: bool
    is_builtin: bool
    tool_prefix: bool
    scope: str
    created_by_id: uuid.UUID

    @classmethod
    def from_model(cls, server: MCPServer) -> "MCPServerPublic":
        """Create public schema from model."""
        return cls(
            id=server.id,
            organization_id=server.organization_id,
            team_id=server.team_id,
            user_id=server.user_id,
            name=server.name,
            description=server.description,
            url=server.url,
            transport=server.transport,
            auth_type=server.auth_type,
            auth_header_name=server.auth_header_name,
            has_auth_secret=server.auth_secret_ref is not None,
            enabled=server.enabled,
            is_builtin=server.is_builtin,
            tool_prefix=server.tool_prefix,
            scope=server.scope,
            created_by_id=server.created_by_id,
            created_at=server.created_at,
            updated_at=server.updated_at,
        )


# MCPServerList is now PaginatedResponse[MCPServerPublic]
MCPServerList = PaginatedResponse[MCPServerPublic]


class MCPToolPublic(SQLModel):
    """Public schema for an MCP tool."""

    name: str
    description: str


class MCPServerWithTools(SQLModel):
    """MCP server with its discovered tools."""

    server_id: str
    server_name: str
    server_description: str | None
    scope: str
    enabled: bool
    tools: list[MCPToolPublic]
    tool_count: int
    error: str | None = None


class MCPToolsList(SQLModel):
    """Response schema for effective tools endpoint."""

    servers: list[MCPServerWithTools]
    total_tools: int
    total_servers: int
    error_count: int


# Rebuild models after all imports

MCPServer.model_rebuild()
