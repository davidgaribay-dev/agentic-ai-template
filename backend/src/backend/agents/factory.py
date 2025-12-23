"""Agent factory for creating per-request agent instances.

Provides factory functions that create properly configured agents
for each request, avoiding global state issues and ensuring clean
context scoping.

Key principles:
- Agents are created per-request with appropriate tools loaded
- Checkpointer is shared (connection pooled) but agents are isolated
- Context is passed explicitly rather than relying on globals
- Step limits prevent runaway agents
"""

from dataclasses import dataclass, field
from typing import Any
import uuid

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sqlmodel import Session

from backend.agents.base import (
    create_agent_graph,
    create_agent_graph_with_tool_approval,
    create_agent_graph_with_tools,
)
from backend.agents.context import LLMContext
from backend.agents.tools import get_available_tools, get_context_aware_tools
from backend.agents.tracing import build_langfuse_config
from backend.core.db import engine
from backend.core.logging import get_logger
from backend.mcp.client import get_mcp_tools_for_context
from backend.settings.service import get_effective_settings

logger = get_logger(__name__)


# Step limits to prevent runaway agents
DEFAULT_MAX_STEPS = 25
TOOL_AGENT_MAX_STEPS = 50


@dataclass
class AgentConfig:
    """Configuration for agent creation.

    Encapsulates all the settings needed to create and run an agent,
    making dependencies explicit rather than implicit.
    """

    # Context for API key resolution and settings lookup
    org_id: str | None = None
    team_id: str | None = None
    user_id: str | None = None
    provider: str | None = None

    # Conversation threading
    thread_id: str | None = None

    # Agent behavior
    max_steps: int = DEFAULT_MAX_STEPS
    include_mcp_tools: bool = True
    require_tool_approval: bool | None = None  # None = use settings

    # Tracing
    enable_tracing: bool = True

    def to_llm_context(self) -> LLMContext:
        """Convert to LLMContext for use with context managers."""
        return LLMContext(
            org_id=self.org_id,
            team_id=self.team_id,
            user_id=self.user_id,
            provider=self.provider,
        )


@dataclass
class AgentInstance:
    """An agent instance with its associated configuration and tools.

    This is the result of factory creation - a fully configured agent
    ready to handle a request.
    """

    graph: Any  # Compiled LangGraph
    config: AgentConfig
    langfuse_config: dict = field(default_factory=dict)
    tools: list = field(default_factory=list)
    mcp_tool_names: set = field(default_factory=set)

    @property
    def has_mcp_tools(self) -> bool:
        """Check if this agent has MCP tools loaded."""
        return bool(self.mcp_tool_names)

    @property
    def requires_approval(self) -> bool:
        """Check if this agent requires tool approval."""
        return self.has_mcp_tools and bool(self.config.require_tool_approval)


class AgentFactory:
    """Factory for creating agent instances.

    Centralizes agent creation logic and manages shared resources
    like the checkpointer connection pool.

    Usage:
        factory = AgentFactory(checkpointer)
        agent = await factory.create(AgentConfig(
            org_id=str(org.id),
            team_id=str(team.id),
            user_id=str(user.id),
        ))
        result = await agent.graph.ainvoke(...)
    """

    def __init__(self, checkpointer: AsyncPostgresSaver | None = None):
        self._checkpointer = checkpointer

    async def create(self, config: AgentConfig) -> AgentInstance:
        """Create an agent instance for the given configuration.

        Args:
            config: Agent configuration

        Returns:
            Fully configured AgentInstance ready to handle requests
        """
        logger.info(
            "creating_agent_instance",
            org_id=config.org_id,
            team_id=config.team_id,
            include_mcp=config.include_mcp_tools,
        )

        # Collect tools - start with built-in tools
        all_tools = list(get_available_tools())
        mcp_tool_names: set[str] = set()

        # Add context-aware tools (like search_documents) if we have context
        if config.org_id and config.user_id:
            context_tools = get_context_aware_tools(
                org_id=config.org_id,
                team_id=config.team_id,
                user_id=config.user_id,
            )
            if context_tools:
                all_tools.extend(context_tools)
                logger.info(
                    "context_aware_tools_loaded",
                    count=len(context_tools),
                    names=[t.name for t in context_tools],
                )

        # Add MCP tools if enabled and context is available
        if config.include_mcp_tools and config.org_id and config.user_id:
            mcp_tools = await self._load_mcp_tools(config)
            if mcp_tools:
                mcp_tool_names = {t.name for t in mcp_tools}
                all_tools.extend(mcp_tools)
                logger.info(
                    "mcp_tools_loaded",
                    count=len(mcp_tools),
                    names=list(mcp_tool_names),
                )

        # Filter disabled tools
        all_tools, mcp_tool_names = await self._filter_disabled_tools(
            config, all_tools, mcp_tool_names
        )

        # Determine if tool approval is required
        require_approval = config.require_tool_approval
        if require_approval is None:
            require_approval = await self._check_approval_required(config)

        # Update config with resolved approval setting
        config.require_tool_approval = require_approval

        # Create the appropriate graph
        if all_tools:
            if mcp_tool_names and require_approval:
                graph = self._create_approval_graph(all_tools, mcp_tool_names)
            else:
                graph = self._create_tools_graph(all_tools)
        else:
            graph = self._create_base_graph()

        # Build Langfuse config
        langfuse_config = {}
        if config.enable_tracing:
            langfuse_config = build_langfuse_config(
                user_id=config.user_id,
                session_id=config.thread_id,
                org_id=config.org_id,
                team_id=config.team_id,
                provider=config.provider,
            )

        return AgentInstance(
            graph=graph,
            config=config,
            langfuse_config=langfuse_config,
            tools=all_tools,
            mcp_tool_names=mcp_tool_names,
        )

    async def create_simple(
        self,
        org_id: str | None = None,
        team_id: str | None = None,
        user_id: str | None = None,
        thread_id: str | None = None,
        provider: str | None = None,
    ) -> AgentInstance:
        """Convenience method for creating an agent with common options.

        Args:
            org_id: Organization ID
            team_id: Team ID
            user_id: User ID
            thread_id: Conversation thread ID
            provider: LLM provider override

        Returns:
            Configured AgentInstance
        """
        config = AgentConfig(
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            thread_id=thread_id,
            provider=provider,
        )
        return await self.create(config)

    def _create_base_graph(self) -> Any:
        """Create a simple chat graph without tools."""
        return create_agent_graph(checkpointer=self._checkpointer)

    def _create_tools_graph(self, tools: list) -> Any:
        """Create a graph with tools but no approval required."""
        return create_agent_graph_with_tools(
            tools=tools,
            checkpointer=self._checkpointer,
        )

    def _create_approval_graph(self, tools: list, mcp_tool_names: set[str]) -> Any:
        """Create a graph with tool approval for MCP tools."""
        return create_agent_graph_with_tool_approval(
            tools=tools,
            mcp_tool_names=mcp_tool_names,
            checkpointer=self._checkpointer,
        )

    async def _load_mcp_tools(self, config: AgentConfig) -> list:
        """Load MCP tools for the given context."""
        try:
            with Session(engine) as session:
                return await get_mcp_tools_for_context(
                    org_id=config.org_id,
                    team_id=config.team_id,
                    user_id=config.user_id,
                    session=session,
                )
        except Exception as e:
            logger.warning("mcp_tools_load_failed", error=str(e))
            return []

    async def _filter_disabled_tools(
        self,
        config: AgentConfig,
        tools: list,
        mcp_tool_names: set[str],
    ) -> tuple[list, set[str]]:
        """Filter out disabled tools based on user settings."""
        if not config.org_id or not config.user_id:
            return tools, mcp_tool_names

        try:
            with Session(engine) as session:
                effective = get_effective_settings(
                    session=session,
                    user_id=uuid.UUID(config.user_id),
                    organization_id=uuid.UUID(config.org_id) if config.org_id else None,
                    team_id=uuid.UUID(config.team_id) if config.team_id else None,
                )
                disabled = set(effective.disabled_tools)

                if disabled:
                    original_count = len(tools)
                    tools = [t for t in tools if t.name not in disabled]
                    mcp_tool_names = mcp_tool_names - disabled
                    logger.info(
                        "tools_filtered",
                        original=original_count,
                        remaining=len(tools),
                        disabled=list(disabled),
                    )

        except Exception as e:
            logger.warning("tool_filter_failed", error=str(e))

        return tools, mcp_tool_names

    async def _check_approval_required(self, config: AgentConfig) -> bool:
        """Check if tool approval is required based on settings."""
        if not config.org_id or not config.user_id:
            return True  # Default to requiring approval

        try:
            with Session(engine) as session:
                effective = get_effective_settings(
                    session=session,
                    user_id=uuid.UUID(config.user_id),
                    organization_id=uuid.UUID(config.org_id) if config.org_id else None,
                    team_id=uuid.UUID(config.team_id) if config.team_id else None,
                )
                return effective.mcp_tool_approval_required
        except Exception as e:
            logger.warning("approval_check_failed", error=str(e))
            return True  # Default to requiring approval


# Module-level factory instance (initialized with checkpointer in lifespan)
_factory: AgentFactory | None = None


def get_agent_factory() -> AgentFactory:
    """Get the global agent factory instance.

    The factory must be initialized before use via init_agent_factory().

    Raises:
        RuntimeError: If factory not initialized
    """
    if _factory is None:
        raise RuntimeError(
            "Agent factory not initialized. Call init_agent_factory() first."
        )
    return _factory


def init_agent_factory(checkpointer: AsyncPostgresSaver | None = None) -> AgentFactory:
    """Initialize the global agent factory.

    Should be called during app startup after checkpointer is ready.

    Args:
        checkpointer: PostgreSQL checkpointer for conversation persistence

    Returns:
        The initialized factory
    """
    global _factory
    _factory = AgentFactory(checkpointer=checkpointer)
    logger.info("agent_factory_initialized")
    return _factory


def reset_agent_factory() -> None:
    """Reset the global agent factory.

    Should be called during app shutdown.
    """
    global _factory
    _factory = None
    logger.info("agent_factory_reset")
