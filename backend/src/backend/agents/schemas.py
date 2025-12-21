from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=100000,
        description="User message to send to the agent (max 100,000 characters)",
    )
    conversation_id: str | None = Field(
        default=None,
        description="Optional conversation ID for context continuity",
    )
    organization_id: str | None = Field(
        default=None,
        description="Organization ID for multi-tenant scoping",
    )
    team_id: str | None = Field(
        default=None,
        description="Team ID for multi-tenant scoping",
    )
    stream: bool = Field(
        default=True,
        description="Whether to stream the response via SSE",
    )


class ChatResponse(BaseModel):
    message: str = Field(..., description="Agent response message")
    conversation_id: str = Field(..., description="Conversation ID for future requests")


class SSEEvent(BaseModel):
    event: str = Field(..., description="Event type: 'message', 'done', 'error'")
    data: str = Field(..., description="Event data")


class HealthResponse(BaseModel):
    status: str = Field(default="ok")
    llm_configured: bool = Field(
        ..., description="Whether an LLM API key is configured"
    )


class Message(BaseModel):
    message: str = Field(..., description="Response message")


class ToolApprovalRequest(BaseModel):
    """Request to approve or reject a pending MCP tool call."""

    conversation_id: str = Field(
        ...,
        description="Conversation ID with the pending tool call",
    )
    organization_id: str = Field(
        ...,
        description="Organization ID for multi-tenant scoping",
    )
    team_id: str | None = Field(
        default=None,
        description="Team ID for multi-tenant scoping",
    )
    approved: bool = Field(
        ...,
        description="Whether the user approves the tool call",
    )
    stream: bool = Field(
        default=True,
        description="Whether to stream the response via SSE",
    )


class ToolApprovalInfo(BaseModel):
    """Information about a pending tool call requiring approval."""

    conversation_id: str = Field(..., description="Conversation ID")
    tool_name: str = Field(..., description="Name of the tool being called")
    tool_args: dict = Field(default_factory=dict, description="Arguments passed to the tool")
    tool_call_id: str | None = Field(default=None, description="Unique ID for this tool call")
    tool_description: str = Field(default="", description="Description of what the tool does")
