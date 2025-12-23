import base64
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from contextvars import ContextVar
import json
import traceback
from typing import Any
import uuid

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command, interrupt
from psycopg_pool import AsyncConnectionPool
from sqlmodel import Session, select

from backend.agents.llm import get_chat_model, get_chat_model_with_context
from backend.agents.tools import get_available_tools, get_context_aware_tools
from backend.agents.tracing import build_langfuse_config
from backend.core.config import settings
from backend.core.db import engine
from backend.core.logging import get_logger
from backend.core.storage import get_chat_media_content
from backend.mcp.client import get_mcp_tools_for_context
from backend.media.models import ChatMedia
from backend.memory.extraction import format_memories_for_context
from backend.memory.service import MemoryService
from backend.memory.store import get_memory_store
from backend.prompts import crud as prompts_crud
from backend.settings.service import get_effective_settings

__all__ = [
    "agent_lifespan",
    "get_agent",
    "get_agent_with_tools",
    "get_checkpointer",
    "get_conversation_history",
    "get_interrupted_tool_call",
    "resume_agent_with_context",
    "run_agent",
    "run_agent_with_context",
    "stream_agent",
    "stream_agent_with_context",
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


def _extract_media_from_content(
    content: Any, additional_kwargs: dict | None = None
) -> list[dict]:
    """Extract media information from message content blocks.

    Looks for image_url blocks in multimodal content and extracts metadata.
    Returns media IDs and metadata for history reconstruction.

    Args:
        content: The message content - can be str or list of dicts
        additional_kwargs: Optional additional_kwargs from the message
            containing media_metadata

    Returns:
        List of media info dicts with structure:
        {"id": str, "filename": str, "mime_type": str, "type": "image"}
    """
    # First, check if we have media_metadata in additional_kwargs (preferred)
    if additional_kwargs and "media_metadata" in additional_kwargs:
        metadata = additional_kwargs["media_metadata"]
        if isinstance(metadata, list):
            return [
                {
                    "id": m.get("id", ""),
                    "filename": m.get("filename", ""),
                    "mime_type": m.get("mime_type", "image/png"),
                    "type": "image",
                }
                for m in metadata
                if isinstance(m, dict) and m.get("id")
            ]

    # Fall back to extracting from content blocks (for backwards compatibility)
    if not isinstance(content, list):
        return []

    media_items = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "image_url":
            # Check for media_id in the block (new format)
            media_id = block.get("media_id", "")

            image_url_data = block.get("image_url", {})
            url = (
                image_url_data.get("url", "")
                if isinstance(image_url_data, dict)
                else ""
            )

            # Parse mime type from data URL: data:image/jpeg;base64,...
            mime_type = "image/png"  # default
            if url.startswith("data:image/"):
                try:
                    mime_part = url[5 : url.index(";")]
                    mime_type = mime_part if "/" in mime_part else f"image/{mime_part}"
                except (ValueError, IndexError):
                    pass

            if media_id:
                media_items.append(
                    {
                        "id": media_id,
                        "filename": "",  # Not available in this format
                        "mime_type": mime_type,
                        "type": "image",
                    }
                )

    return media_items


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


def _build_multimodal_message(
    message: str,
    media_list: list[ChatMedia],
) -> HumanMessage:
    """Build a multimodal HumanMessage with text and images.

    Creates a message with content blocks for text and images.
    Images are encoded as base64 data URLs for LLM consumption.
    Media metadata (id, filename, mime_type) is stored for history reconstruction.

    Args:
        message: The text message content
        media_list: List of ChatMedia records to include as images

    Returns:
        HumanMessage with multimodal content and media metadata
    """
    content_blocks: list[dict] = []

    # Add text content first
    content_blocks.append({"type": "text", "text": message})

    # Collect media metadata for reconstruction in history
    media_metadata: list[dict] = []

    # Add images
    for media in media_list:
        try:
            # Get image content from storage
            image_bytes = get_chat_media_content(media.file_path)
            base64_data = base64.b64encode(image_bytes).decode("utf-8")

            # Add image block with data URL and media ID for reference
            content_blocks.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media.mime_type};base64,{base64_data}",
                    },
                    # Store media ID for history reconstruction
                    "media_id": str(media.id),
                }
            )

            # Store metadata for history
            media_metadata.append(
                {
                    "id": str(media.id),
                    "filename": media.filename,
                    "mime_type": media.mime_type,
                }
            )

            logger.debug(
                "multimodal_image_added",
                media_id=str(media.id),
                filename=media.filename,
                mime_type=media.mime_type,
            )
        except Exception as e:
            logger.warning(
                "multimodal_image_failed",
                media_id=str(media.id),
                error=str(e),
            )
            # Continue without this image

    # Return message with media metadata stored in additional_kwargs
    # This allows reconstruction of media URLs when loading history
    return HumanMessage(
        content=content_blocks,
        additional_kwargs={"media_metadata": media_metadata} if media_metadata else {},
    )


def _get_media_for_message(
    media_ids: list[str],
    user_id: str,
) -> list[ChatMedia]:
    """Fetch media records for the given IDs, filtered by user ownership.

    Args:
        media_ids: List of media ID strings
        user_id: User ID (must own the media)

    Returns:
        List of ChatMedia records
    """
    if not media_ids:
        return []

    try:
        with Session(engine) as session:
            statement = select(ChatMedia).where(
                ChatMedia.id.in_([uuid.UUID(mid) for mid in media_ids]),  # type: ignore[attr-defined]
                ChatMedia.created_by_id == uuid.UUID(user_id),
                ChatMedia.deleted_at == None,  # noqa: E711
            )
            return list(session.exec(statement).all())
    except Exception as e:
        logger.warning("failed_to_fetch_media", error=str(e), media_ids=media_ids)
        return []


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
        logger.debug(
            "mcp_check_skipped", reason="missing_ids", org_id=org_id, user_id=user_id
        )
        return False

    try:
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


def _get_disabled_tools_config(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> tuple[set[str], set[str]]:
    """Get disabled MCP servers and tools for the given context.

    Returns a tuple of (disabled_server_ids, disabled_tool_names).
    Merges disabled lists from all hierarchy levels (org -> team -> user).
    """
    if not org_id or not user_id:
        return set(), set()

    try:
        with Session(engine) as session:
            effective = get_effective_settings(
                session=session,
                user_id=uuid.UUID(user_id),
                organization_id=uuid.UUID(org_id) if org_id else None,
                team_id=uuid.UUID(team_id) if team_id else None,
            )
            return (
                set(effective.disabled_mcp_servers),
                set(effective.disabled_tools),
            )
    except Exception as e:
        logger.warning("failed_to_get_disabled_tools_config", error=str(e))
        return set(), set()


async def _get_mcp_tools(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> list:
    """Get MCP tools for the given context.

    Returns an empty list if MCP is disabled or no tools are configured.
    """
    logger.info(
        "_get_mcp_tools_called", org_id=org_id, team_id=team_id, user_id=user_id
    )

    if not org_id or not user_id:
        logger.info("_get_mcp_tools_skipped", reason="missing_ids")
        return []

    if not _is_mcp_enabled(org_id, team_id, user_id):
        logger.info("_get_mcp_tools_skipped", reason="mcp_disabled")
        return []

    try:
        logger.info("_get_mcp_tools_loading", org_id=org_id, team_id=team_id)
        with Session(engine) as session:
            tools = await get_mcp_tools_for_context(
                org_id=org_id,
                team_id=team_id,
                user_id=user_id,
                session=session,
            )
            logger.info(
                "_get_mcp_tools_loaded",
                tool_count=len(tools),
                tool_names=[t.name for t in tools],
            )
            return tools
    except Exception as e:
        logger.warning(
            "failed_to_get_mcp_tools", error=str(e), error_type=type(e).__name__
        )
        logger.warning(
            "failed_to_get_mcp_tools_traceback", traceback=traceback.format_exc()
        )
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
        with Session(engine) as session:
            result = prompts_crud.get_active_system_prompt(
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
            if system_prompt and (
                not messages or not isinstance(messages[0], SystemMessage)
            ):
                # Prepend system message if not already present
                messages = [SystemMessage(content=system_prompt), *messages]
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
                                    messages = [messages[0], memory_msg, *messages[1:]]
                                else:
                                    messages = [memory_msg, *messages]
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


def _get_orphaned_tool_calls(messages: list) -> list[dict]:
    """Find orphaned tool_use blocks that lack corresponding ToolMessages.

    Anthropic requires every tool_use block to have a corresponding tool_result.
    This function detects orphaned tool calls from cancelled/abandoned approvals.

    Args:
        messages: List of messages from the state

    Returns:
        List of orphaned tool call dicts (with id, name, args)
    """
    # Build set of tool_call_ids that have responses
    responded_ids = set()
    for msg in messages:
        if isinstance(msg, ToolMessage):
            responded_ids.add(msg.tool_call_id)

    # Log message structure for debugging
    logger.info(
        "orphan_check_message_structure",
        total_messages=len(messages),
        message_types=[type(m).__name__ for m in messages],
        responded_tool_call_ids=list(responded_ids),
    )

    # Find orphaned tool calls
    orphaned = []
    for idx, msg in enumerate(messages):
        if isinstance(msg, AIMessage):
            # Log AIMessage details for debugging - check all possible tool call locations
            tool_calls_from_attr = msg.tool_calls if msg.tool_calls else []
            tool_calls_from_additional = (
                msg.additional_kwargs.get("tool_calls", [])
                if hasattr(msg, "additional_kwargs") and msg.additional_kwargs
                else []
            )

            # Also check content for tool_use blocks (Anthropic format)
            tool_use_in_content = []
            if isinstance(msg.content, list):
                for block in msg.content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        tool_use_in_content.append(block)

            logger.info(
                "orphan_check_ai_message",
                msg_index=idx,
                has_tool_calls_attr=bool(tool_calls_from_attr),
                tool_calls_attr_count=len(tool_calls_from_attr),
                tool_calls_attr=tool_calls_from_attr,
                has_tool_calls_additional=bool(tool_calls_from_additional),
                tool_calls_additional_count=len(tool_calls_from_additional),
                has_tool_use_in_content=bool(tool_use_in_content),
                tool_use_content_count=len(tool_use_in_content),
                content_type=type(msg.content).__name__,
                content_preview=str(msg.content)[:200] if msg.content else "",
            )

            # Merge all sources of tool calls
            all_tool_calls = list(tool_calls_from_attr)
            # Add from additional_kwargs if not already present
            existing_ids = {tc.get("id") for tc in all_tool_calls if tc.get("id")}
            for tc in tool_calls_from_additional:
                if tc.get("id") and tc.get("id") not in existing_ids:
                    all_tool_calls.append(tc)
                    existing_ids.add(tc.get("id"))
            # Add from content blocks if not already present
            for block in tool_use_in_content:
                if block.get("id") and block.get("id") not in existing_ids:
                    all_tool_calls.append(
                        {
                            "id": block.get("id"),
                            "name": block.get("name"),
                            "args": block.get("input", {}),
                        }
                    )
                    existing_ids.add(block.get("id"))

            if all_tool_calls:
                for tc in all_tool_calls:
                    tc_id = tc.get("id")
                    if tc_id and tc_id not in responded_ids:
                        orphaned.append(tc)
                        logger.info(
                            "orphan_found",
                            tool_call_id=tc_id,
                            tool_name=tc.get("name"),
                        )

    return orphaned


def _create_rejection_messages(orphaned_tool_calls: list[dict]) -> list[ToolMessage]:
    """Create rejection ToolMessages for orphaned tool calls.

    Args:
        orphaned_tool_calls: List of orphaned tool call dicts

    Returns:
        List of ToolMessages rejecting each orphaned call
    """
    return [
        ToolMessage(
            content="Tool call was cancelled by the user.",
            tool_call_id=tc.get("id"),
        )
        for tc in orphaned_tool_calls
    ]


def _get_all_tool_calls_from_message(msg: AIMessage) -> list[dict]:
    """Extract all tool calls from an AIMessage, checking all possible locations.

    Tool calls can be in:
    1. msg.tool_calls (LangChain standard)
    2. msg.additional_kwargs["tool_calls"] (some providers)
    3. msg.content (as tool_use blocks for Anthropic format)

    Args:
        msg: AIMessage to extract tool calls from

    Returns:
        List of tool call dicts with id, name, and args
    """
    all_tool_calls = []
    existing_ids = set()

    # Check msg.tool_calls
    if msg.tool_calls:
        for tc in msg.tool_calls:
            if tc.get("id") and tc.get("id") not in existing_ids:
                all_tool_calls.append(tc)
                existing_ids.add(tc.get("id"))

    # Check additional_kwargs
    if hasattr(msg, "additional_kwargs") and msg.additional_kwargs:
        for tc in msg.additional_kwargs.get("tool_calls", []):
            if tc.get("id") and tc.get("id") not in existing_ids:
                all_tool_calls.append(tc)
                existing_ids.add(tc.get("id"))

    # Check content for tool_use blocks (Anthropic format)
    if isinstance(msg.content, list):
        for block in msg.content:
            if (
                isinstance(block, dict)
                and block.get("type") == "tool_use"
                and block.get("id")
                and block.get("id") not in existing_ids
            ):
                all_tool_calls.append(
                    {
                        "id": block.get("id"),
                        "name": block.get("name"),
                        "args": block.get("input", {}),
                    }
                )
                existing_ids.add(block.get("id"))

    return all_tool_calls


def _fix_orphaned_tool_calls_in_messages(messages: list) -> list:
    """Fix orphaned tool calls by inserting rejection ToolMessages in the correct position.

    Anthropic requires ToolMessages to immediately follow the AIMessage containing
    the tool_use. This function rebuilds the message list, inserting rejection
    ToolMessages right after the AIMessage that contains orphaned tool calls.

    Args:
        messages: List of messages that may have orphaned tool calls

    Returns:
        New list of messages with rejection ToolMessages inserted correctly
    """
    # Build set of tool_call_ids that have responses
    responded_ids = set()
    for msg in messages:
        if isinstance(msg, ToolMessage):
            responded_ids.add(msg.tool_call_id)

    # Rebuild messages with rejection ToolMessages inserted in correct position
    fixed_messages = []
    for msg in messages:
        fixed_messages.append(msg)

        # After each AIMessage, check for orphaned tool calls and insert rejections
        if isinstance(msg, AIMessage):
            all_tool_calls = _get_all_tool_calls_from_message(msg)
            orphaned_in_msg = [
                tc
                for tc in all_tool_calls
                if tc.get("id") and tc.get("id") not in responded_ids
            ]
            if orphaned_in_msg:
                # Insert rejection ToolMessages immediately after this AIMessage
                for tc in orphaned_in_msg:
                    fixed_messages.append(
                        ToolMessage(
                            content="Tool call was cancelled by the user.",
                            tool_call_id=tc.get("id"),
                        )
                    )
                    # Mark as responded so we don't duplicate
                    responded_ids.add(tc.get("id"))

    return fixed_messages


def create_agent_graph_with_tools(
    tools: list,
    checkpointer: AsyncPostgresSaver | None = None,
) -> Any:
    """Create a ReAct-style agent graph with tool support.

    This agent can use tools (including MCP tools) to accomplish tasks.
    Uses conditional edges to loop between the LLM and tool execution.

    Includes an orphan cleanup node that runs at the start to handle
    any orphaned tool_use blocks from abandoned approvals.
    """

    def cleanup_orphans_node(state: MessagesState) -> dict:
        """Clean up orphaned tool calls from abandoned approvals.

        This node runs at graph entry to ensure the message history is valid
        before invoking the LLM. Anthropic requires every tool_use to have
        a corresponding tool_result.
        """
        messages = state["messages"]

        logger.info(
            "cleanup_orphans_node_called",
            message_count=len(messages),
            message_types=[type(m).__name__ for m in messages],
        )

        orphaned = _get_orphaned_tool_calls(messages)

        if not orphaned:
            logger.info("cleanup_orphans_node_no_orphans")
            return {}

        logger.info(
            "cleaning_orphaned_tool_calls",
            count=len(orphaned),
            tool_call_ids=[tc.get("id") for tc in orphaned],
        )

        # Return rejection messages for orphaned calls
        return {"messages": _create_rejection_messages(orphaned)}

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

        logger.info(
            "chat_node_state_messages",
            message_count=len(messages),
            message_types=[type(m).__name__ for m in messages],
        )

        # Fix orphaned tool calls by inserting rejection ToolMessages in correct position
        # Anthropic API requires every tool_use to have a corresponding tool_result
        # IMMEDIATELY AFTER it (not at the end of the message list).
        # See: https://github.com/langchain-ai/langgraph/issues/5109
        orphaned = _get_orphaned_tool_calls(messages)
        if orphaned:
            logger.info(
                "chat_node_fixing_orphaned_tool_calls",
                count=len(orphaned),
                tool_call_ids=[tc.get("id") for tc in orphaned],
            )
            messages = _fix_orphaned_tool_calls_in_messages(messages)

            # Verify fix was applied
            still_orphaned = _get_orphaned_tool_calls(messages)
            if still_orphaned:
                logger.error(
                    "chat_node_orphan_fix_failed",
                    original_count=len(orphaned),
                    remaining_count=len(still_orphaned),
                    remaining_ids=[tc.get("id") for tc in still_orphaned],
                )
            else:
                logger.info(
                    "chat_node_orphan_fix_verified",
                    fixed_count=len(orphaned),
                )

        # Add system prompt if we have context and it's configured
        if ctx:
            system_prompt = _get_system_prompt_content(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if system_prompt and (
                not messages or not isinstance(messages[0], SystemMessage)
            ):
                messages = [SystemMessage(content=system_prompt), *messages]
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
                                    messages = [messages[0], memory_msg, *messages[1:]]
                                else:
                                    messages = [memory_msg, *messages]
                                logger.debug(
                                    "memories_injected",
                                    count=len(memories),
                                    user_id=ctx.get("user_id"),
                                )
                except Exception as e:
                    logger.warning("memory_injection_failed", error=str(e))

        # Log final messages being sent to LLM for debugging orphan issues
        logger.info(
            "chat_node_invoking_llm_tools_graph",
            message_count=len(messages),
            message_types=[type(m).__name__ for m in messages],
            # Log tool_calls for each AIMessage to verify orphan fix
            ai_message_tool_calls=[
                {
                    "idx": i,
                    "tool_calls": m.tool_calls
                    if hasattr(m, "tool_calls") and m.tool_calls
                    else [],
                }
                for i, m in enumerate(messages)
                if isinstance(m, AIMessage)
            ],
            # Log ToolMessage ids to verify they're present
            tool_message_ids=[
                m.tool_call_id for m in messages if isinstance(m, ToolMessage)
            ],
        )

        response = await llm.ainvoke(messages)
        return {"messages": [response]}

    # Build graph with tools
    graph = StateGraph(MessagesState)
    graph.add_node("cleanup_orphans", cleanup_orphans_node)
    graph.add_node("chat", chat_node)
    graph.add_node("tools", ToolNode(tools))

    # Start with cleanup, then proceed to chat
    graph.add_edge(START, "cleanup_orphans")
    graph.add_edge("cleanup_orphans", "chat")
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

    Includes an orphan cleanup node that runs at the start to handle
    any orphaned tool_use blocks from abandoned approvals.

    Args:
        tools: List of all tools (built-in + MCP)
        mcp_tool_names: Set of tool names that require approval (MCP tools)
        checkpointer: Optional checkpointer for persistence
    """

    def cleanup_orphans_node(state: MessagesState) -> dict:
        """Clean up orphaned tool calls from abandoned approvals.

        This node runs at graph entry to ensure the message history is valid
        before invoking the LLM. Anthropic requires every tool_use to have
        a corresponding tool_result.
        """
        messages = state["messages"]

        logger.info(
            "cleanup_orphans_node_called_approval_graph",
            message_count=len(messages),
            message_types=[type(m).__name__ for m in messages],
        )

        orphaned = _get_orphaned_tool_calls(messages)

        if not orphaned:
            logger.info("cleanup_orphans_node_no_orphans_approval_graph")
            return {}

        logger.info(
            "cleaning_orphaned_tool_calls",
            count=len(orphaned),
            tool_call_ids=[tc.get("id") for tc in orphaned],
        )

        # Return rejection messages for orphaned calls
        return {"messages": _create_rejection_messages(orphaned)}

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

        logger.info(
            "chat_node_state_messages_approval_graph",
            message_count=len(messages),
            message_types=[type(m).__name__ for m in messages],
        )

        # Fix orphaned tool calls by inserting rejection ToolMessages in correct position
        # This is critical for handling abandoned interrupts where a user sends
        # a new message instead of approving/rejecting a pending tool call.
        # Anthropic API requires every tool_use to have a corresponding tool_result
        # IMMEDIATELY AFTER it (not at the end of the message list).
        # See: https://github.com/langchain-ai/langgraph/issues/5109
        orphaned = _get_orphaned_tool_calls(messages)
        if orphaned:
            logger.info(
                "chat_node_fixing_orphaned_tool_calls_approval_graph",
                count=len(orphaned),
                tool_call_ids=[tc.get("id") for tc in orphaned],
            )
            messages = _fix_orphaned_tool_calls_in_messages(messages)

            # Verify fix was applied
            still_orphaned = _get_orphaned_tool_calls(messages)
            if still_orphaned:
                logger.error(
                    "chat_node_orphan_fix_failed",
                    original_count=len(orphaned),
                    remaining_count=len(still_orphaned),
                    remaining_ids=[tc.get("id") for tc in still_orphaned],
                )
            else:
                logger.info(
                    "chat_node_orphan_fix_verified",
                    fixed_count=len(orphaned),
                )

        # Add system prompt if we have context and it's configured
        if ctx:
            system_prompt = _get_system_prompt_content(
                org_id=ctx.get("org_id"),
                team_id=ctx.get("team_id"),
                user_id=ctx.get("user_id"),
            )
            if system_prompt and (
                not messages or not isinstance(messages[0], SystemMessage)
            ):
                messages = [SystemMessage(content=system_prompt), *messages]
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
                                    messages = [messages[0], memory_msg, *messages[1:]]
                                else:
                                    messages = [memory_msg, *messages]
                                logger.debug(
                                    "memories_injected",
                                    count=len(memories),
                                    user_id=ctx.get("user_id"),
                                )
                except Exception as e:
                    logger.warning("memory_injection_failed", error=str(e))

        # Log final messages being sent to LLM for debugging orphan issues
        logger.info(
            "chat_node_invoking_llm_approval_graph",
            message_count=len(messages),
            message_types=[type(m).__name__ for m in messages],
            # Log tool_calls for each AIMessage to verify orphan fix
            ai_message_tool_calls=[
                {
                    "idx": i,
                    "tool_calls": m.tool_calls
                    if hasattr(m, "tool_calls") and m.tool_calls
                    else [],
                }
                for i, m in enumerate(messages)
                if isinstance(m, AIMessage)
            ],
            # Log ToolMessage ids to verify they're present
            tool_message_ids=[
                m.tool_call_id for m in messages if isinstance(m, ToolMessage)
            ],
        )

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
                approval = interrupt(
                    {
                        "type": "tool_approval",
                        "tool_name": tool_name,
                        "tool_args": tool_call.get("args", {}),
                        "tool_call_id": tool_call.get("id"),
                        "tool_description": next(
                            (t.description for t in tools if t.name == tool_name),
                            "No description available",
                        ),
                    }
                )

                # Check user's decision
                if not approval or not approval.get("approved", False):
                    logger.info(
                        "tool_approval_rejected",
                        tool_name=tool_name,
                        tool_call_id=tool_call.get("id"),
                    )
                    # Return a tool message indicating rejection with context
                    # The LLM will see this and can explain why it needed the tool
                    return {
                        "messages": [
                            ToolMessage(
                                content=(
                                    f"The user declined permission to use the '{tool_name}' tool. "
                                    f"Please acknowledge this, explain what you were trying to accomplish, "
                                    f"and ask if they'd like you to proceed differently or try an alternative approach."
                                ),
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
    graph.add_node("cleanup_orphans", cleanup_orphans_node)
    graph.add_node("chat", chat_node)
    graph.add_node("tool_approval", tool_approval_node)
    graph.add_node("tools", ToolNode(tools))

    # Start with cleanup, then proceed to chat
    graph.add_edge(START, "cleanup_orphans")
    graph.add_edge("cleanup_orphans", "chat")

    # After chat, check if tools are needed
    graph.add_conditional_edges(
        "chat",
        tools_condition,
        {
            "tools": "tool_approval",  # Go to approval first
            END: END,
        },
    )

    # After approval, either execute tools or go back to chat (if rejected)
    graph.add_conditional_edges(
        "tool_approval",
        route_after_approval,
        {
            "tools": "tools",
            "chat": "cleanup_orphans",  # Route through cleanup in case of rejection
        },
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

    # Collect all tools - start with built-in tools
    all_tools = list(get_available_tools())
    {t.name for t in all_tools}
    logger.info(
        "builtin_tools_loaded",
        tool_count=len(all_tools),
        tool_names=[t.name for t in all_tools],
    )

    # Add context-aware tools (like search_documents) if we have context
    if org_id and user_id:
        context_tools = get_context_aware_tools(
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
        )
        if context_tools:
            all_tools.extend(context_tools)
            logger.info(
                "context_aware_tools_loaded",
                count=len(context_tools),
                names=[t.name for t in context_tools],
            )

    # Track MCP tool names for approval
    mcp_tool_names: set[str] = set()

    # Add MCP tools if context is available and MCP is enabled
    if org_id and user_id:
        logger.info(
            "loading_mcp_tools", org_id=org_id, team_id=team_id, user_id=user_id
        )
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

    # Filter out disabled tools based on user settings
    if org_id and user_id:
        _disabled_servers, disabled_tools = _get_disabled_tools_config(
            org_id, team_id, user_id
        )
        if disabled_tools:
            original_count = len(all_tools)
            all_tools = [t for t in all_tools if t.name not in disabled_tools]
            # Also update mcp_tool_names to reflect filtered tools
            mcp_tool_names = mcp_tool_names - disabled_tools
            filtered_count = original_count - len(all_tools)
            logger.info(
                "tools_filtered_by_user_settings",
                original_count=original_count,
                filtered_count=filtered_count,
                remaining_count=len(all_tools),
                disabled_tools=list(disabled_tools),
            )

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
        logger.exception("streaming_error", error=str(e), thread_id=thread_id)
        raise


async def run_agent_with_context(
    message: str,
    org_id: str,
    team_id: str | None = None,
    thread_id: str | None = None,
    provider: str | None = None,
    user_id: str | None = None,
    media_ids: list[str] | None = None,
) -> str:
    """Run the agent with organization/team context for Infisical API keys.

    This version uses the context variable to pass org/team info to the chat node,
    which then fetches the appropriate API key from Infisical and system prompt.

    Supports multimodal messages with images when media_ids are provided.

    Args:
        message: User message to process
        org_id: Organization ID for API key scoping
        team_id: Optional team ID for team-level API key override
        thread_id: Optional thread ID for conversation persistence
        provider: Optional LLM provider override
        user_id: Optional user ID for Langfuse tracing and system prompt lookup
        media_ids: Optional list of media IDs (images) to include in the message

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

    token = _llm_context.set(
        {
            "org_id": org_id,
            "team_id": team_id,
            "provider": provider,
            "user_id": user_id,
        }
    )

    try:
        logger.info(
            "running_agent_with_context",
            thread_id=thread_id,
            org_id=org_id,
            team_id=team_id,
            has_checkpointer=thread_id is not None,
            langfuse_enabled=settings.langfuse_enabled,
        )

        # Build the input message (text-only or multimodal with images)
        if media_ids and user_id:
            media_list = _get_media_for_message(media_ids, user_id)
            if media_list:
                logger.info(
                    "multimodal_message_building_sync",
                    thread_id=thread_id,
                    media_count=len(media_list),
                )
                input_message = _build_multimodal_message(message, media_list)
            else:
                input_message = HumanMessage(content=message)
        else:
            input_message = HumanMessage(content=message)

        result = await agent.ainvoke(
            {"messages": [input_message]},
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
    media_ids: list[str] | None = None,
) -> AsyncGenerator[dict | str, None]:
    """Stream the agent response with organization/team context.

    This version uses the context variable to pass org/team info to the chat node,
    which then fetches the appropriate API key from Infisical and system prompt.
    If MCP is enabled and servers are configured, loads MCP tools.

    When tool approval is required and an MCP tool is called, yields a dict with
    interrupt information instead of string tokens.

    Supports multimodal messages with images when media_ids are provided.

    Args:
        message: User message to process
        org_id: Organization ID for API key scoping
        team_id: Optional team ID for team-level API key override
        thread_id: Optional thread ID for conversation persistence
        provider: Optional LLM provider override
        user_id: Optional user ID for Langfuse tracing and system prompt lookup
        media_ids: Optional list of media IDs (images) to include in the message

    Yields:
        Response tokens as strings, or a dict with interrupt info for tool approval
    """
    token = _llm_context.set(
        {
            "org_id": org_id,
            "team_id": team_id,
            "provider": provider,
            "user_id": user_id,
        }
    )

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

        # Check and fix orphaned tool calls in the checkpoint BEFORE invoking
        # This is critical because LangGraph may not go through our cleanup_orphans node
        # when continuing an existing conversation (it may jump directly to chat node)
        if thread_id:
            try:
                existing_state = await agent.aget_state(config)
                if existing_state.values and "messages" in existing_state.values:
                    existing_messages = existing_state.values["messages"]
                    logger.info(
                        "stream_existing_checkpoint_state",
                        thread_id=thread_id,
                        message_count=len(existing_messages),
                        message_types=[type(m).__name__ for m in existing_messages],
                        next_nodes=list(existing_state.next)
                        if existing_state.next
                        else [],
                    )
                    # Check for orphaned tool calls in the checkpoint
                    existing_orphans = _get_orphaned_tool_calls(existing_messages)
                    if existing_orphans:
                        logger.warning(
                            "stream_checkpoint_has_orphans_fixing",
                            thread_id=thread_id,
                            orphan_count=len(existing_orphans),
                            orphan_ids=[tc.get("id") for tc in existing_orphans],
                        )
                        # Fix the checkpoint by updating state with rejection messages
                        rejection_messages = _create_rejection_messages(
                            existing_orphans
                        )
                        await agent.aupdate_state(
                            config,
                            {"messages": rejection_messages},
                        )
                        logger.info(
                            "stream_checkpoint_orphans_fixed",
                            thread_id=thread_id,
                            fixed_count=len(existing_orphans),
                        )
            except Exception as e:
                logger.warning("stream_get_state_failed", error=str(e))

        # Build the input message (text-only or multimodal with images)
        if media_ids and user_id:
            media_list = _get_media_for_message(media_ids, user_id)
            if media_list:
                logger.info(
                    "multimodal_message_building",
                    thread_id=thread_id,
                    media_count=len(media_list),
                )
                input_message = _build_multimodal_message(message, media_list)
            else:
                input_message = HumanMessage(content=message)
        else:
            input_message = HumanMessage(content=message)

        async for event in agent.astream_events(
            {"messages": [input_message]},
            config=config if config else None,
            version="v2",
        ):
            event_type = event.get("event", "")

            # Debug: Log tool-related events
            if "tool" in event_type.lower():
                logger.info(
                    "tool_event_received",
                    event_type=event_type,
                    event_name=event.get("name", ""),
                    event_keys=list(event.keys()),
                    thread_id=thread_id,
                )

            if event_type == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    # Extract text content, handling both string and list formats
                    # Anthropic returns list of content blocks when using tools
                    text = _extract_text_content(chunk.content)
                    if text:
                        yield text

            # Capture search_documents tool results for citation display
            elif event_type == "on_tool_end":
                tool_name = event.get("name", "")
                if tool_name == "search_documents":
                    tool_output = event.get("data", {}).get("output", "")
                    # Extract content from ToolMessage if needed
                    if hasattr(tool_output, "content"):
                        tool_output = tool_output.content
                    try:
                        result_data = json.loads(tool_output)
                        sources = result_data.get("results", [])
                        if sources:
                            logger.info(
                                "search_documents_sources_captured",
                                source_count=len(sources),
                                thread_id=thread_id,
                            )
                            yield {
                                "type": "sources",
                                "data": sources,
                            }
                    except Exception as e:
                        logger.warning(
                            "search_documents_parse_failed",
                            error=str(e),
                            thread_id=thread_id,
                        )

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
        error_str = str(e)

        # Check if this is an orphaned tool_use error from Anthropic
        if (
            "tool_use" in error_str
            and "tool_result" in error_str
            and "immediately after" in error_str
        ):
            logger.warning(
                "orphaned_tool_use_error_detected",
                error=error_str,
                thread_id=thread_id,
            )

            # Try to fix the orphaned tool calls in the checkpoint and retry
            if thread_id:
                try:
                    existing_state = await agent.aget_state(config)
                    if existing_state.values and "messages" in existing_state.values:
                        existing_messages = existing_state.values["messages"]
                        existing_orphans = _get_orphaned_tool_calls(existing_messages)

                        if existing_orphans:
                            logger.info(
                                "fixing_orphans_after_error",
                                thread_id=thread_id,
                                orphan_count=len(existing_orphans),
                                orphan_ids=[tc.get("id") for tc in existing_orphans],
                            )

                            # Add rejection messages for each orphan
                            rejection_messages = _create_rejection_messages(
                                existing_orphans
                            )
                            await agent.aupdate_state(
                                config,
                                {"messages": rejection_messages},
                            )

                            logger.info(
                                "orphans_fixed_retrying_stream",
                                thread_id=thread_id,
                            )

                            # Retry the stream with the fixed state
                            async for event in agent.astream_events(
                                {"messages": [HumanMessage(content=message)]},
                                config=config if config else None,
                                version="v2",
                            ):
                                if event["event"] == "on_chat_model_stream":
                                    chunk = event["data"].get("chunk")
                                    if chunk and chunk.content:
                                        text = _extract_text_content(chunk.content)
                                        if text:
                                            yield text

                            logger.info("retry_streaming_complete", thread_id=thread_id)
                            return  # Success on retry, return early

                except Exception as retry_error:
                    logger.exception(
                        "orphan_fix_retry_failed",
                        original_error=error_str,
                        retry_error=str(retry_error),
                        thread_id=thread_id,
                    )

        logger.exception(
            "streaming_error_with_context",
            error=error_str,
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
        List of messages in the conversation. Each message contains:
        - role: "user" or "assistant"
        - content: The text content
        - media: Optional list of media info for multimodal messages
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

            msg_dict: dict = {
                "role": "user" if isinstance(m, HumanMessage) else "assistant",
                "content": content,
            }

            # For user messages, check for media attachments
            if isinstance(m, HumanMessage):
                # Pass additional_kwargs which may contain media_metadata
                additional_kwargs = getattr(m, "additional_kwargs", None)
                media_info = _extract_media_from_content(m.content, additional_kwargs)
                if media_info:
                    msg_dict["media"] = media_info

            messages.append(msg_dict)
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
        result = None
        if state.next and "tool_approval" in state.next:
            # The interrupt payload is stored in the state's tasks
            # LangGraph stores interrupt data in a specific way
            if hasattr(state, "tasks") and state.tasks:
                for task in state.tasks:
                    if hasattr(task, "interrupts") and task.interrupts:
                        for interrupt_data in task.interrupts:
                            if hasattr(interrupt_data, "value"):
                                result = interrupt_data.value
                                break
                        if result is not None:
                            break
            if result is None:
                logger.warning("interrupted_state_no_data", thread_id=thread_id)
    except Exception as e:
        logger.exception(
            "get_interrupted_tool_call_error", error=str(e), thread_id=thread_id
        )
        result = None

    return result


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
    token = _llm_context.set(
        {
            "org_id": org_id,
            "team_id": team_id,
            "provider": provider,
            "user_id": user_id,
        }
    )

    try:
        agent = await get_agent_with_tools(org_id, team_id, user_id)

        config = build_langfuse_config(
            user_id=user_id,
            session_id=thread_id,
            org_id=org_id,
            team_id=team_id,
            provider=provider,
        )

        # Check if conversation is actually in an interrupted state
        state = await agent.aget_state(config)
        if not state.next or "tool_approval" not in state.next:
            logger.warning(
                "resume_called_but_not_interrupted",
                thread_id=thread_id,
                next_nodes=state.next if state.next else [],
            )
            # Conversation is not waiting for approval - this can happen if the user
            # abandoned the approval and then sent a new message.
            # Return a message indicating the tool was already handled.
            yield "The previous tool request is no longer pending. Please continue the conversation."
            return

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
        logger.exception(
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
