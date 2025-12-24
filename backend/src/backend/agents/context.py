"""Context management for agent execution.

Provides safe scoping of context variables to prevent bleeding between requests.
Uses Python's contextvars with explicit reset to ensure cleanup.
"""

from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any


@dataclass
class LLMContext:
    """Context data for LLM invocations.

    Contains org/team/user context for:
    - API key resolution from Infisical
    - System prompt lookup
    - Memory retrieval
    - MCP tool loading
    """

    org_id: str | None = None
    team_id: str | None = None
    user_id: str | None = None
    provider: str | None = None
    has_media: bool = False  # Skip memory retrieval when inline attachments present

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for compatibility with existing code."""
        return {
            "org_id": self.org_id,
            "team_id": self.team_id,
            "user_id": self.user_id,
            "provider": self.provider,
            "has_media": self.has_media,
        }


_llm_context: ContextVar[LLMContext | None] = ContextVar("_llm_context", default=None)


def get_llm_context() -> LLMContext | None:
    """Get the current LLM context.

    Returns None if called outside of an llm_context() block.
    """
    return _llm_context.get()


def get_llm_context_dict() -> dict[str, Any] | None:
    """Get the current LLM context as a dict.

    For backwards compatibility with existing code that expects dict.
    """
    ctx = _llm_context.get()
    return ctx.to_dict() if ctx else None


@contextmanager
def llm_context(
    org_id: str | None = None,
    team_id: str | None = None,
    user_id: str | None = None,
    provider: str | None = None,
) -> Generator[LLMContext, None, None]:
    """Context manager for safely scoping LLM context.

    Ensures context is properly set and cleaned up, preventing
    context bleeding between concurrent requests.

    Args:
        org_id: Organization ID for API key resolution
        team_id: Team ID for team-level API key override
        user_id: User ID for user-specific settings
        provider: Optional LLM provider override

    Usage:
        with llm_context(org_id=str(org.id), team_id=str(team.id)):
            response = await agent.invoke(...)
        # Context is automatically cleaned up here

    Note:
        The context is only visible within the current async task.
        Each concurrent request has its own isolated context.
    """
    ctx = LLMContext(
        org_id=org_id,
        team_id=team_id,
        user_id=user_id,
        provider=provider,
    )
    token: Token[LLMContext | None] = _llm_context.set(ctx)
    try:
        yield ctx
    finally:
        _llm_context.reset(token)


@dataclass
class RequestContext:
    """Broader request context including LLM context.

    Can be extended to include other request-scoped data like:
    - Request ID for tracing
    - User authentication info
    - Cached settings
    """

    request_id: str | None = None
    llm: LLMContext | None = None


_request_context: ContextVar[RequestContext | None] = ContextVar(
    "_request_context", default=None
)


def get_request_context() -> RequestContext | None:
    """Get the current request context."""
    return _request_context.get()


@contextmanager
def request_context(
    request_id: str | None = None,
    org_id: str | None = None,
    team_id: str | None = None,
    user_id: str | None = None,
    provider: str | None = None,
) -> Generator[RequestContext, None, None]:
    """Context manager for full request context.

    Includes both request-level info and LLM context.
    Use this for the outer scope of request handling.
    """
    llm = LLMContext(
        org_id=org_id,
        team_id=team_id,
        user_id=user_id,
        provider=provider,
    )
    ctx = RequestContext(request_id=request_id, llm=llm)

    # Set both contexts
    request_token: Token[RequestContext | None] = _request_context.set(ctx)
    llm_token: Token[LLMContext | None] = _llm_context.set(llm)

    try:
        yield ctx
    finally:
        _llm_context.reset(llm_token)
        _request_context.reset(request_token)
