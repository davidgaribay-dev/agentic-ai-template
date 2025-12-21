from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any

import uuid

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from psycopg_pool import AsyncConnectionPool

from backend.agents.llm import get_chat_model, get_chat_model_with_context
from backend.agents.tracing import build_langfuse_config, get_langfuse_handler
from backend.core.config import settings
from backend.core.logging import get_logger
from backend.memory.extraction import format_memories_for_context
from backend.memory.service import MemoryService
from backend.memory.store import get_memory_store

__all__ = [
    "get_agent",
    "run_agent",
    "stream_agent",
    "run_agent_with_context",
    "stream_agent_with_context",
    "get_conversation_history",
    "agent_lifespan",
    "get_checkpointer",
]

logger = get_logger(__name__)

_llm_context: ContextVar[dict | None] = ContextVar("_llm_context", default=None)


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
                    yield str(chunk.content)

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
) -> AsyncGenerator[str, None]:
    """Stream the agent response with organization/team context.

    This version uses the context variable to pass org/team info to the chat node,
    which then fetches the appropriate API key from Infisical and system prompt.

    Args:
        message: User message to process
        org_id: Organization ID for API key scoping
        team_id: Optional team ID for team-level API key override
        thread_id: Optional thread ID for conversation persistence
        provider: Optional LLM provider override
        user_id: Optional user ID for Langfuse tracing and system prompt lookup

    Yields:
        Response tokens as they are generated
    """
    token = _llm_context.set({
        "org_id": org_id,
        "team_id": team_id,
        "provider": provider,
        "user_id": user_id,
    })

    try:
        agent = await get_agent()

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
                    yield str(chunk.content)

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
        return [
            {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": str(m.content)}
            for m in state.values["messages"]
        ]

    return []


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
