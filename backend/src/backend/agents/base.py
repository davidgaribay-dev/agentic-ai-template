from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any

import uuid

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command, interrupt
from psycopg_pool import AsyncConnectionPool

from backend.agents.llm import get_chat_model, get_chat_model_with_context
from backend.agents.tools import get_available_tools
from backend.agents.tracing import build_langfuse_config, get_langfuse_handler
from backend.core.config import settings
from backend.core.logging import get_logger
from backend.memory.extraction import format_memories_for_context
from backend.memory.service import MemoryService
from backend.memory.store import get_memory_store

__all__ = [
    "get_agent",
    "get_agent_with_tools",
    "run_agent",
    "stream_agent",
    "run_agent_with_context",
    "stream_agent_with_context",
    "resume_agent_with_context",
    "get_conversation_history",
    "get_interrupted_tool_call",
    "agent_lifespan",
    "get_checkpointer",
]

logger = get_logger(__name__)

_llm_context: ContextVar[dict | None] = ContextVar("_llm_context", default=None)


def _extract_text_content(content: Any) -> str:
    """Extract text content from LLM chunk content.

    Handles both string content (OpenAI format) and list of content blocks
    (Anthropic format when using tools). Filters out tool_use, input_json_delta,
    and other non-text content types.

    Args:
        content: The chunk content from LLM streaming - can be str or list of dicts

    Returns:
        Extracted text content as a string, or empty string if no text found
    """
    # Simple string content (OpenAI and some other providers)
    if isinstance(content, str):
        return content

    # List of content blocks (Anthropic format with tools)
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict):
                block_type = block.get("type")
                # Only extract text blocks, skip tool_use and input_json_delta
                if block_type == "text":
                    text = block.get("text", "")
                    if text:
                        text_parts.append(text)
            elif isinstance(block, str):
                # Handle case where list contains strings
                text_parts.append(block)
        return "".join(text_parts)

    # Fallback - try to convert to string only if it's not a complex structure
    if content is not None:
        content_str = str(content)
        # Don't return raw dict/list representations that got stringified
        if not content_str.startswith(("[{", "{'", "['")):
            return content_str

    return ""


def _is_memory_enabled(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> bool:
    """Check if memory is enabled for the given context.

    Uses the settings hierarchy: org > team > user.
    Returns False if any level disables memory.
    """
    if not org_id or not user_id:
        return False

    try:
        from backend.core.db import engine
        from backend.settings.service import get_effective_settings
        from sqlmodel import Session

        with Session(engine) as session:
            effective = get_effective_settings(
                session=session,
                user_id=uuid.UUID(user_id),
                organization_id=uuid.UUID(org_id) if org_id else None,
                team_id=uuid.UUID(team_id) if team_id else None,
            )
            return effective.memory_enabled
    except Exception as e:
        logger.warning("failed_to_check_memory_settings", error=str(e))
        return False


def _is_mcp_enabled(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> bool:
    """Check if MCP is enabled for the given context.

    Uses the settings hierarchy: org > team > user.
    Returns False if any level disables MCP.
    """
    if not org_id or not user_id:
        logger.debug("mcp_check_skipped", reason="missing_ids", org_id=org_id, user_id=user_id)
        return False

    try:
        from backend.core.db import engine
        from backend.settings.service import get_effective_settings
        from sqlmodel import Session

        with Session(engine) as session:
            effective = get_effective_settings(
                session=session,
                user_id=uuid.UUID(user_id),
                organization_id=uuid.UUID(org_id) if org_id else None,
                team_id=uuid.UUID(team_id) if team_id else None,
            )
            logger.info(
                "mcp_enabled_check",
                mcp_enabled=effective.mcp_enabled,
                disabled_by=effective.mcp_disabled_by,
                org_id=org_id,
                team_id=team_id,
            )
            return effective.mcp_enabled
    except Exception as e:
        logger.warning("failed_to_check_mcp_settings", error=str(e))
        return False


def _is_tool_approval_required(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> bool:
    """Check if MCP tool approval is required for the given context.

    Uses the settings hierarchy: if ANY level requires approval, it's required.
    """
    if not org_id or not user_id:
        return True  # Default to requiring approval if context is missing

    try:
        from backend.core.db import engine
        from backend.settings.service import get_effective_settings
        from sqlmodel import Session

        with Session(engine) as session:
            effective = get_effective_settings(
                session=session,
                user_id=uuid.UUID(user_id),
                organization_id=uuid.UUID(org_id) if org_id else None,
                team_id=uuid.UUID(team_id) if team_id else None,
            )
            return effective.mcp_tool_approval_required
    except Exception as e:
        logger.warning("failed_to_check_tool_approval_settings", error=str(e))
        return True  # Default to requiring approval on error


async def _get_mcp_tools(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> list:
    """Get MCP tools for the given context.

    Returns an empty list if MCP is disabled or no tools are configured.
    """
    logger.info("_get_mcp_tools_called", org_id=org_id, team_id=team_id, user_id=user_id)

    if not org_id or not user_id:
        logger.info("_get_mcp_tools_skipped", reason="missing_ids")
        return []

    if not _is_mcp_enabled(org_id, team_id, user_id):
        logger.info("_get_mcp_tools_skipped", reason="mcp_disabled")
        return []

    try:
        from backend.core.db import engine
        from backend.mcp.client import get_mcp_tools_for_context
        from sqlmodel import Session

        logger.info("_get_mcp_tools_loading", org_id=org_id, team_id=team_id)
        with Session(engine) as session:
            tools = await get_mcp_tools_for_context(
                org_id=org_id,
                team_id=team_id,
                user_id=user_id,
                session=session,
            )
            logger.info("_get_mcp_tools_loaded", tool_count=len(tools), tool_names=[t.name for t in tools])
            return tools
    except Exception as e:
        logger.warning("failed_to_get_mcp_tools", error=str(e), error_type=type(e).__name__)
        import traceback
        logger.warning("failed_to_get_mcp_tools_traceback", traceback=traceback.format_exc())
        return []


def _get_system_prompt_content(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> str | None:
    """Get the concatenated system prompt for the given context.

    This is a synchronous function that creates its own database session
    to fetch the active system prompts.

    Returns:
        Concatenated system prompt content, or None if no active prompts.
    """
    if not org_id or not team_id or not user_id:
        return None

    try:
        from backend.core.db import engine
        from backend.prompts import crud
        from sqlmodel import Session

        with Session(engine) as session:
            result = crud.get_active_system_prompt(
                session=session,
                organization_id=uuid.UUID(org_id),
                team_id=uuid.UUID(team_id),
                user_id=uuid.UUID(user_id),
            )
            return result.content if result.content else None
    except Exception as e:
        logger.warning("failed_to_get_system_prompt", error=str(e))
        return None


def create_agent_graph(checkpointer: AsyncPostgresSaver | None = None) -> Any:

    async def chat_node(state: MessagesState) -> dict:
        """Process messages and generate a response.

        Uses context-aware LLM if org/team context is set,
        otherwise falls back to environment variable based LLM.
        Prepends system prompt if available.
        """
        ctx = _llm_context.get()
        if ctx and ctx.get("org_id"):
            llm = get_chat_model_with_context(
                org_id=ctx["org_id"],
                team_id=ctx.get("team_id"),
                provider=ctx.get("provider"),
            )
        else:
            llm = get_chat_model(settings.DEFAULT_LLM_PROVIDER)

        # Build messages list with optional system prompt
        messages = list(state["messages"])

        # Add system prompt if we have context and it's configured
        if ctx:
            system_prompt = _get_system_prompt_content(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if system_prompt:
                # Prepend system message if not already present
                if not messages or not isinstance(messages[0], SystemMessage):
                    messages = [SystemMessage(content=system_prompt)] + messages
                    logger.debug("system_prompt_added", length=len(system_prompt))

        # Inject relevant memories if enabled
        if ctx and ctx.get("org_id") and ctx.get("user_id"):
            memory_enabled = _is_memory_enabled(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if memory_enabled:
                try:
                    store = await get_memory_store()
                    service = MemoryService(store)

                    # Get the last user message for semantic search
                    last_message = ""
                    for msg in reversed(messages):
                        if isinstance(msg, HumanMessage):
                            last_message = str(msg.content)
                            break

                    if last_message:
                        memories = await service.search_memories(
                            org_id=ctx.get("org_id"),
                            team_id=ctx.get("team_id") or "default",
                            user_id=ctx.get("user_id"),
                            query=last_message,
                            limit=5,
                        )

                        if memories:
                            memory_context = format_memories_for_context(memories)
                            if memory_context:
                                # Add memory context as a system message after any existing system prompt
                                memory_msg = SystemMessage(content=memory_context)
                                if messages and isinstance(messages[0], SystemMessage):
                                    # Insert after existing system prompt
                                    messages = [messages[0], memory_msg] + messages[1:]
                                else:
                                    messages = [memory_msg] + messages
                                logger.debug(
                                    "memories_injected",
                                    count=len(memories),
                                    user_id=ctx.get("user_id"),
                                )
                except Exception as e:
                    # Don't fail the request if memory retrieval fails
                    logger.warning("memory_injection_failed", error=str(e))

        response = await llm.ainvoke(messages)
        return {"messages": [response]}

    graph = StateGraph(MessagesState)
    graph.add_node("chat", chat_node)
    graph.add_edge(START, "chat")
    graph.add_edge("chat", END)

    return graph.compile(checkpointer=checkpointer)


def create_agent_graph_with_tools(
    tools: list,
    checkpointer: AsyncPostgresSaver | None = None,
) -> Any:
    """Create a ReAct-style agent graph with tool support.

    This agent can use tools (including MCP tools) to accomplish tasks.
    Uses conditional edges to loop between the LLM and tool execution.
    """

    async def chat_node(state: MessagesState) -> dict:
        """Process messages and generate a response, potentially with tool calls."""
        ctx = _llm_context.get()
        if ctx and ctx.get("org_id"):
            llm = get_chat_model_with_context(
                org_id=ctx["org_id"],
                team_id=ctx.get("team_id"),
                provider=ctx.get("provider"),
            )
        else:
            llm = get_chat_model(settings.DEFAULT_LLM_PROVIDER)

        # Bind tools to the LLM
        if tools:
            llm = llm.bind_tools(tools)

        # Build messages list with optional system prompt
        messages = list(state["messages"])

        # Add system prompt if we have context and it's configured
        if ctx:
            system_prompt = _get_system_prompt_content(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if system_prompt:
                if not messages or not isinstance(messages[0], SystemMessage):
                    messages = [SystemMessage(content=system_prompt)] + messages
                    logger.debug("system_prompt_added", length=len(system_prompt))

        # Inject relevant memories if enabled
        if ctx and ctx.get("org_id") and ctx.get("user_id"):
            memory_enabled = _is_memory_enabled(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if memory_enabled:
                try:
                    store = await get_memory_store()
                    service = MemoryService(store)

                    last_message = ""
                    for msg in reversed(messages):
                        if isinstance(msg, HumanMessage):
                            last_message = str(msg.content)
                            break

                    if last_message:
                        memories = await service.search_memories(
                            org_id=ctx.get("org_id"),
                            team_id=ctx.get("team_id") or "default",
                            user_id=ctx.get("user_id"),
                            query=last_message,
                            limit=5,
                        )

                        if memories:
                            memory_context = format_memories_for_context(memories)
                            if memory_context:
                                memory_msg = SystemMessage(content=memory_context)
                                if messages and isinstance(messages[0], SystemMessage):
                                    messages = [messages[0], memory_msg] + messages[1:]
                                else:
                                    messages = [memory_msg] + messages
                                logger.debug(
                                    "memories_injected",
                                    count=len(memories),
                                    user_id=ctx.get("user_id"),
                                )
                except Exception as e:
                    logger.warning("memory_injection_failed", error=str(e))

        response = await llm.ainvoke(messages)
        return {"messages": [response]}

    # Build graph with tools
    graph = StateGraph(MessagesState)
    graph.add_node("chat", chat_node)
    graph.add_node("tools", ToolNode(tools))

    graph.add_edge(START, "chat")
    graph.add_conditional_edges("chat", tools_condition)
    graph.add_edge("tools", "chat")

    return graph.compile(checkpointer=checkpointer)


def create_agent_graph_with_tool_approval(
    tools: list,
    mcp_tool_names: set[str],
    checkpointer: AsyncPostgresSaver | None = None,
) -> Any:
    """Create a ReAct-style agent graph with human-in-the-loop tool approval.

    MCP tools require user approval before execution. The graph will pause
    via interrupt() when an MCP tool is called, send details to the user,
    and wait for approval before proceeding.

    Args:
        tools: List of all tools (built-in + MCP)
        mcp_tool_names: Set of tool names that require approval (MCP tools)
        checkpointer: Optional checkpointer for persistence
    """

    async def chat_node(state: MessagesState) -> dict:
        """Process messages and generate a response, potentially with tool calls."""
        ctx = _llm_context.get()
        if ctx and ctx.get("org_id"):
            llm = get_chat_model_with_context(
                org_id=ctx["org_id"],
                team_id=ctx.get("team_id"),
                provider=ctx.get("provider"),
            )
        else:
            llm = get_chat_model(settings.DEFAULT_LLM_PROVIDER)

        # Bind tools to the LLM
        if tools:
            llm = llm.bind_tools(tools)

        # Build messages list with optional system prompt
        messages = list(state["messages"])

        # Add system prompt if we have context and it's configured
        if ctx:
            system_prompt = _get_system_prompt_content(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if system_prompt:
                if not messages or not isinstance(messages[0], SystemMessage):
                    messages = [SystemMessage(content=system_prompt)] + messages
                    logger.debug("system_prompt_added", length=len(system_prompt))

        # Inject relevant memories if enabled
        if ctx and ctx.get("org_id") and ctx.get("user_id"):
            memory_enabled = _is_memory_enabled(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if memory_enabled:
                try:
                    store = await get_memory_store()
                    service = MemoryService(store)

                    last_message = ""
                    for msg in reversed(messages):
                        if isinstance(msg, HumanMessage):
                            last_message = str(msg.content)
                            break

                    if last_message:
                        memories = await service.search_memories(
                            org_id=ctx.get("org_id"),
                            team_id=ctx.get("team_id") or "default",
                            user_id=ctx.get("user_id"),
                            query=last_message,
                            limit=5,
                        )

                        if memories:
                            memory_context = format_memories_for_context(memories)
                            if memory_context:
                                memory_msg = SystemMessage(content=memory_context)
                                if messages and isinstance(messages[0], SystemMessage):
                                    messages = [messages[0], memory_msg] + messages[1:]
                                else:
                                    messages = [memory_msg] + messages
                                logger.debug(
                                    "memories_injected",
                                    count=len(memories),
                                    user_id=ctx.get("user_id"),
                                )
                except Exception as e:
                    logger.warning("memory_injection_failed", error=str(e))

        response = await llm.ainvoke(messages)
        return {"messages": [response]}

    def tool_approval_node(state: MessagesState) -> dict:
        """Check for MCP tool calls and request human approval.

        This node runs after the chat node when tools are needed.
        For each MCP tool call, it interrupts to get user approval.
        """
        last_msg = state["messages"][-1]

        if not isinstance(last_msg, AIMessage) or not last_msg.tool_calls:
            return {}

        # Process each tool call that needs approval
        for tool_call in last_msg.tool_calls:
            tool_name = tool_call.get("name", "")

            if tool_name in mcp_tool_names:
                logger.info(
                    "tool_approval_required",
                    tool_name=tool_name,
                    tool_call_id=tool_call.get("id"),
                )

                # Interrupt and wait for user approval
                # The interrupt payload will be sent to the frontend
                approval = interrupt({
                    "type": "tool_approval",
                    "tool_name": tool_name,
                    "tool_args": tool_call.get("args", {}),
                    "tool_call_id": tool_call.get("id"),
                    "tool_description": next(
                        (t.description for t in tools if t.name == tool_name),
                        "No description available"
                    ),
                })

                # Check user's decision
                if not approval or not approval.get("approved", False):
                    logger.info(
                        "tool_approval_rejected",
                        tool_name=tool_name,
                        tool_call_id=tool_call.get("id"),
                    )
                    # Return a tool message indicating rejection
                    return {
                        "messages": [
                            ToolMessage(
                                content=f"Tool '{tool_name}' was not approved by the user.",
                                tool_call_id=tool_call.get("id"),
                            )
                        ]
                    }

                logger.info(
                    "tool_approval_granted",
                    tool_name=tool_name,
                    tool_call_id=tool_call.get("id"),
                )

        # All tools approved (or no MCP tools in the call)
        return {}

    def route_after_approval(state: MessagesState) -> str:
        """Route based on whether tools were rejected or approved."""
        last_msg = state["messages"][-1]

        # If last message is a ToolMessage (from rejection), go back to chat
        if isinstance(last_msg, ToolMessage):
            return "chat"

        # Otherwise proceed to execute tools
        return "tools"

    # Build graph with approval flow
    graph = StateGraph(MessagesState)
    graph.add_node("chat", chat_node)
    graph.add_node("tool_approval", tool_approval_node)
    graph.add_node("tools", ToolNode(tools))

    graph.add_edge(START, "chat")

    # After chat, check if tools are needed
    graph.add_conditional_edges(
        "chat",
        tools_condition,
        {
            "tools": "tool_approval",  # Go to approval first
            END: END,
        }
    )

    # After approval, either execute tools or go back to chat (if rejected)
    graph.add_conditional_edges(
        "tool_approval",
        route_after_approval,
        {
            "tools": "tools",
            "chat": "chat",
        }
    )

    # After tools execute, go back to chat
    graph.add_edge("tools", "chat")

    return graph.compile(checkpointer=checkpointer)


async def get_agent_with_tools(
    org_id: str | None = None,
    team_id: str | None = None,
    user_id: str | None = None,
    require_tool_approval: bool | None = None,
) -> Any:
    """Get an agent with tools (including MCP tools).

    This creates a new agent instance with tools loaded for the given context.
    Tools include both built-in tools and MCP tools from configured servers.

    Args:
        org_id: Organization ID
        team_id: Team ID
        user_id: User ID
        require_tool_approval: Override for tool approval setting. If None,
            uses the setting from the org/team/user hierarchy.
    """
    logger.info(
        "get_agent_with_tools_called",
        org_id=org_id,
        team_id=team_id,
        user_id=user_id,
    )

    checkpointer = await _init_checkpointer()

    # Collect all tools
    all_tools = list(get_available_tools())
    builtin_tool_names = {t.name for t in all_tools}
    logger.info("builtin_tools_loaded", tool_count=len(all_tools), tool_names=[t.name for t in all_tools])

    # Track MCP tool names for approval
    mcp_tool_names: set[str] = set()

    # Add MCP tools if context is available and MCP is enabled
    if org_id and user_id:
        logger.info("loading_mcp_tools", org_id=org_id, team_id=team_id, user_id=user_id)
        mcp_tools = await _get_mcp_tools(org_id, team_id, user_id)
        if mcp_tools:
            mcp_tool_names = {t.name for t in mcp_tools}
            all_tools.extend(mcp_tools)
            logger.info(
                "mcp_tools_added_to_agent",
                mcp_tool_count=len(mcp_tools),
                mcp_tool_names=list(mcp_tool_names),
                total_tool_count=len(all_tools),
            )
        else:
            logger.info("no_mcp_tools_returned")
    else:
        logger.info("skipping_mcp_tools", reason="missing_org_or_user_id")

    if not all_tools:
        return create_agent_graph(checkpointer=checkpointer)

    # Check if tool approval is required
    if require_tool_approval is None:
        require_tool_approval = _is_tool_approval_required(org_id, team_id, user_id)

    logger.info(
        "agent_tool_approval_setting",
        require_approval=require_tool_approval,
        mcp_tool_count=len(mcp_tool_names),
    )

    # Use approval graph if we have MCP tools and approval is required
    if mcp_tool_names and require_tool_approval:
        logger.info("using_tool_approval_graph", mcp_tools=list(mcp_tool_names))
        return create_agent_graph_with_tool_approval(
            tools=all_tools,
            mcp_tool_names=mcp_tool_names,
            checkpointer=checkpointer,
        )
    else:
        logger.info("using_standard_tools_graph")
        return create_agent_graph_with_tools(tools=all_tools, checkpointer=checkpointer)


_pool: AsyncConnectionPool | None = None
_checkpointer: AsyncPostgresSaver | None = None
_agent: Any = None


async def _init_checkpointer() -> AsyncPostgresSaver:
    global _pool, _checkpointer

    if _checkpointer is not None:
        return _checkpointer

    _pool = AsyncConnectionPool(
        conninfo=settings.CHECKPOINT_DATABASE_URI,
        max_size=20,
        kwargs={"autocommit": True},
        open=False,
    )
    await _pool.open()

    _checkpointer = AsyncPostgresSaver(_pool)
    await _checkpointer.setup()

    logger.info("checkpointer_initialized", uri=settings.POSTGRES_SERVER)
    return _checkpointer


def get_checkpointer() -> AsyncPostgresSaver | None:
    return _checkpointer


async def get_agent() -> Any:
    """Get or create the base agent with PostgreSQL checkpointing.

    This must be called after the agent_lifespan context manager has started.
    """
    global _agent

    if _agent is None:
        checkpointer = await _init_checkpointer()
        _agent = create_agent_graph(checkpointer=checkpointer)

    return _agent


def get_thread_config(thread_id: str) -> dict:
    """Get configuration dict for a conversation thread."""
    return {"configurable": {"thread_id": thread_id}}


async def run_agent(
    message: str,
    thread_id: str | None = None,
    user_id: str | None = None,
) -> str:
    """Run the agent with a message.

    Args:
        message: User message to process
        thread_id: Optional thread ID for conversation persistence.
                  If provided, previous messages in this thread are automatically included.
        user_id: Optional user ID for Langfuse tracing

    Returns:
        Agent response as a string
    """
    agent = await get_agent()

    config = build_langfuse_config(
        user_id=user_id,
        session_id=thread_id,
    )

    logger.info(
        "running_agent",
        thread_id=thread_id,
        has_checkpointer=thread_id is not None,
        langfuse_enabled=settings.langfuse_enabled,
    )

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=message)]},
        config=config if config else None,
    )

    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage):
            return str(msg.content)

    return ""


async def stream_agent(
    message: str,
    thread_id: str | None = None,
    user_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream the agent response using LangGraph's astream_events.

    Args:
        message: User message to process
        thread_id: Optional thread ID for conversation persistence
        user_id: Optional user ID for Langfuse tracing

    Yields:
        Response tokens as they are generated
    """
    try:
        agent = await get_agent()

        config = build_langfuse_config(
            user_id=user_id,
            session_id=thread_id,
        )

        logger.info(
            "streaming_agent",
            thread_id=thread_id,
            has_checkpointer=thread_id is not None,
            langfuse_enabled=settings.langfuse_enabled,
        )

        async for event in agent.astream_events(
            {"messages": [HumanMessage(content=message)]},
            config=config if config else None,
            version="v2",
        ):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    # Extract text content, handling both string and list formats
                    text = _extract_text_content(chunk.content)
                    if text:
                        yield text

        logger.info("streaming_complete", thread_id=thread_id)
    except Exception as e:
        logger.error("streaming_error", error=str(e), thread_id=thread_id)
        raise


async def run_agent_with_context(
    message: str,
    org_id: str,
    team_id: str | None = None,
    thread_id: str | None = None,
    provider: str | None = None,
    user_id: str | None = None,
) -> str:
    """Run the agent with organization/team context for Infisical API keys.

    This version uses the context variable to pass org/team info to the chat node,
    which then fetches the appropriate API key from Infisical and system prompt.

    Args:
        message: User message to process
        org_id: Organization ID for API key scoping
        team_id: Optional team ID for team-level API key override
        thread_id: Optional thread ID for conversation persistence
        provider: Optional LLM provider override
        user_id: Optional user ID for Langfuse tracing and system prompt lookup

    Returns:
        Agent response as a string
    """
    agent = await get_agent()

    config = build_langfuse_config(
        user_id=user_id,
        session_id=thread_id,
        org_id=org_id,
        team_id=team_id,
        provider=provider,
    )

    token = _llm_context.set({
        "org_id": org_id,
        "team_id": team_id,
        "provider": provider,
        "user_id": user_id,
    })

    try:
        logger.info(
            "running_agent_with_context",
            thread_id=thread_id,
            org_id=org_id,
            team_id=team_id,
            has_checkpointer=thread_id is not None,
            langfuse_enabled=settings.langfuse_enabled,
        )

        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config=config if config else None,
        )

        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage):
                return str(msg.content)

        return ""
    finally:
        _llm_context.reset(token)


async def stream_agent_with_context(
    message: str,
    org_id: str,
    team_id: str | None = None,
    thread_id: str | None = None,
    provider: str | None = None,
    user_id: str | None = None,
) -> AsyncGenerator[dict | str, None]:
    """Stream the agent response with organization/team context.

    This version uses the context variable to pass org/team info to the chat node,
    which then fetches the appropriate API key from Infisical and system prompt.
    If MCP is enabled and servers are configured, loads MCP tools.

    When tool approval is required and an MCP tool is called, yields a dict with
    interrupt information instead of string tokens.

    Args:
        message: User message to process
        org_id: Organization ID for API key scoping
        team_id: Optional team ID for team-level API key override
        thread_id: Optional thread ID for conversation persistence
        provider: Optional LLM provider override
        user_id: Optional user ID for Langfuse tracing and system prompt lookup

    Yields:
        Response tokens as strings, or a dict with interrupt info for tool approval
    """
    token = _llm_context.set({
        "org_id": org_id,
        "team_id": team_id,
        "provider": provider,
        "user_id": user_id,
    })

    try:
        # Use agent with tools (includes MCP tools if enabled)
        agent = await get_agent_with_tools(org_id, team_id, user_id)

        config = build_langfuse_config(
            user_id=user_id,
            session_id=thread_id,
            org_id=org_id,
            team_id=team_id,
            provider=provider,
        )

        logger.info(
            "streaming_agent_with_context",
            thread_id=thread_id,
            org_id=org_id,
            team_id=team_id,
            has_checkpointer=thread_id is not None,
            langfuse_enabled=settings.langfuse_enabled,
        )

        async for event in agent.astream_events(
            {"messages": [HumanMessage(content=message)]},
            config=config if config else None,
            version="v2",
        ):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    # Extract text content, handling both string and list formats
                    # Anthropic returns list of content blocks when using tools
                    text = _extract_text_content(chunk.content)
                    if text:
                        yield text

        # After streaming completes, check if we're in an interrupted state
        # This happens when tool approval is required
        state = await agent.aget_state(config)
        if state.next and "tool_approval" in state.next:
            # Get the interrupt data
            interrupt_data = None
            if hasattr(state, "tasks") and state.tasks:
                for task in state.tasks:
                    if hasattr(task, "interrupts") and task.interrupts:
                        for interrupt_info in task.interrupts:
                            if hasattr(interrupt_info, "value"):
                                interrupt_data = interrupt_info.value
                                break
                    if interrupt_data:
                        break

            if interrupt_data:
                logger.info(
                    "tool_approval_interrupt_detected",
                    thread_id=thread_id,
                    tool_name=interrupt_data.get("tool_name"),
                )
                yield {
                    "type": "tool_approval",
                    "data": interrupt_data,
                }
            else:
                logger.warning("interrupt_state_but_no_data", thread_id=thread_id)

        logger.info("streaming_complete_with_context", thread_id=thread_id)
    except Exception as e:
        logger.error(
            "streaming_error_with_context",
            error=str(e),
            thread_id=thread_id,
            org_id=org_id,
        )
        raise
    finally:
        _llm_context.reset(token)


async def get_conversation_history(thread_id: str) -> list[dict]:
    """Get the conversation history for a thread.

    Args:
        thread_id: The thread ID to retrieve history for

    Returns:
        List of messages in the conversation
    """
    agent = await get_agent()
    config = get_thread_config(thread_id)
    state = await agent.aget_state(config)

    if state.values and "messages" in state.values:
        messages = []
        for m in state.values["messages"]:
            # Skip tool messages - they're internal to the agent
            if not isinstance(m, (HumanMessage, AIMessage)):
                continue
            # Extract text content properly (handles Anthropic's list format)
            content = _extract_text_content(m.content)
            # Skip empty messages (e.g., tool invocation responses)
            if not content:
                continue
            messages.append({
                "role": "user" if isinstance(m, HumanMessage) else "assistant",
                "content": content,
            })
        return messages

    return []


async def get_interrupted_tool_call(
    thread_id: str,
    org_id: str,
    team_id: str | None = None,
    user_id: str | None = None,
) -> dict | None:
    """Get the interrupted tool call info for a paused conversation.

    When the agent is paused waiting for tool approval, this returns the
    tool call details that were sent via interrupt().

    Args:
        thread_id: The conversation thread ID
        org_id: Organization ID
        team_id: Optional team ID
        user_id: Optional user ID

    Returns:
        Tool call info dict if interrupted, None otherwise
    """
    agent = await get_agent_with_tools(org_id, team_id, user_id)
    config = get_thread_config(thread_id)

    try:
        state = await agent.aget_state(config)

        # Check if the conversation is in an interrupted state
        if state.next and "tool_approval" in state.next:
            # The interrupt payload is stored in the state's tasks
            # LangGraph stores interrupt data in a specific way
            if hasattr(state, "tasks") and state.tasks:
                for task in state.tasks:
                    if hasattr(task, "interrupts") and task.interrupts:
                        for interrupt_data in task.interrupts:
                            if hasattr(interrupt_data, "value"):
                                return interrupt_data.value
            logger.warning("interrupted_state_no_data", thread_id=thread_id)
        return None
    except Exception as e:
        logger.error("get_interrupted_tool_call_error", error=str(e), thread_id=thread_id)
        return None


async def resume_agent_with_context(
    thread_id: str,
    org_id: str,
    team_id: str | None = None,
    user_id: str | None = None,
    approved: bool = True,
    provider: str | None = None,
) -> AsyncGenerator[dict | str, None]:
    """Resume an interrupted agent with the user's approval decision.

    This is called after the user approves or rejects a tool call.
    The agent will continue from where it was interrupted.

    If the agent calls additional MCP tools after resuming, it will yield
    interrupt data (dict) for each tool requiring approval.

    Args:
        thread_id: The conversation thread ID
        org_id: Organization ID
        team_id: Optional team ID
        user_id: Optional user ID
        approved: Whether the user approved the tool call
        provider: Optional LLM provider override

    Yields:
        Response tokens as strings, or a dict with interrupt info for additional tool approvals
    """
    token = _llm_context.set({
        "org_id": org_id,
        "team_id": team_id,
        "provider": provider,
        "user_id": user_id,
    })

    try:
        agent = await get_agent_with_tools(org_id, team_id, user_id)

        config = build_langfuse_config(
            user_id=user_id,
            session_id=thread_id,
            org_id=org_id,
            team_id=team_id,
            provider=provider,
        )

        logger.info(
            "resuming_agent_with_context",
            thread_id=thread_id,
            org_id=org_id,
            team_id=team_id,
            approved=approved,
        )

        # Resume with the user's decision using Command
        async for event in agent.astream_events(
            Command(resume={"approved": approved}),
            config=config if config else None,
            version="v2",
        ):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    text = _extract_text_content(chunk.content)
                    if text:
                        yield text

        # Check if we hit another interrupt (agent calling more tools)
        state = await agent.aget_state(config)
        if state.next and "tool_approval" in state.next:
            interrupt_data = None
            if hasattr(state, "tasks") and state.tasks:
                for task in state.tasks:
                    if hasattr(task, "interrupts") and task.interrupts:
                        for interrupt_info in task.interrupts:
                            if hasattr(interrupt_info, "value"):
                                interrupt_data = interrupt_info.value
                                break
                    if interrupt_data:
                        break

            if interrupt_data:
                logger.info(
                    "tool_approval_interrupt_on_resume",
                    thread_id=thread_id,
                    tool_name=interrupt_data.get("tool_name"),
                )
                yield {
                    "type": "tool_approval",
                    "data": interrupt_data,
                }

        logger.info("resume_streaming_complete", thread_id=thread_id, approved=approved)
    except Exception as e:
        logger.error(
            "resume_streaming_error",
            error=str(e),
            thread_id=thread_id,
            org_id=org_id,
            approved=approved,
        )
        raise
    finally:
        _llm_context.reset(token)


@asynccontextmanager
async def agent_lifespan():
    """Context manager for agent lifecycle (for app lifespan).

    Initializes the PostgreSQL checkpointer and cleans up on shutdown.
    """
    global _pool, _checkpointer, _agent

    try:
        await _init_checkpointer()
        logger.info("agent_initialized", checkpointer_type="AsyncPostgresSaver")
        yield
    finally:
        _agent = None
        _checkpointer = None
        if _pool is not None:
            await _pool.close()
            _pool = None
        logger.info("agent_shutdown")
