import asyncio
import json
from typing import Annotated
import uuid

from fastapi import APIRouter, HTTPException, Query
from fastapi.params import Depends
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from backend.agents.base import (
    get_conversation_history,
    get_interrupted_tool_call,
    resume_agent_with_context,
    run_agent,
    run_agent_with_context,
    stream_agent,
    stream_agent_with_context,
)
from backend.agents.llm import generate_conversation_title
from backend.agents.schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    ToolApprovalInfo,
    ToolApprovalRequest,
)
from backend.audit import audit_service
from backend.audit.schemas import AuditAction, Target
from backend.auth import CurrentUser, SessionDep
from backend.conversations import (
    ConversationUpdate,
    create_conversation_message,
    create_conversation_with_id,
    get_conversation,
    get_conversation_messages,
    touch_conversation,
    update_conversation,
)
from backend.core.config import Settings, get_settings
from backend.core.db import engine
from backend.core.logging import get_logger
from backend.core.secrets import get_secrets_service
from backend.guardrails.models import GuardrailAction
from backend.guardrails.service import (
    check_input,
    check_output,
    get_effective_guardrails,
)
from backend.media.service import get_chat_media
from backend.memory.extraction import extract_and_store_memories
from backend.organizations.models import OrganizationMember
from backend.settings.service import get_effective_settings


class AgentError(Exception):
    """Base exception for agent-related errors."""


class LLMError(AgentError):
    """Exception for LLM/model errors."""


class LLMConfigurationError(LLMError):
    """Exception for LLM API key/configuration errors.

    This exception is raised when the LLM cannot be initialized due to
    missing or invalid API key configuration. The message should be
    user-friendly as it will be displayed in the UI.
    """


class StreamError(AgentError):
    """Exception for streaming errors."""


router = APIRouter(prefix="/agent", tags=["agent"])
logger = get_logger(__name__)

# Maximum number of messages to return in conversation history
MAX_MESSAGE_HISTORY = 100

# Set to track background tasks and prevent garbage collection
_background_tasks: set[asyncio.Task] = set()


@router.get("/health", response_model=HealthResponse)
async def health_check(
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthResponse:
    """Check if the agent service is healthy and configured.

    LLM is considered configured if either:
    - Environment variables have API keys set
    - Infisical is enabled (API keys can be managed per org/team)
    """
    llm_configured = settings.has_llm_api_key or settings.infisical_enabled
    return HealthResponse(
        status="ok",
        llm_configured=llm_configured,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    session: SessionDep,
    current_user: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ChatResponse | EventSourceResponse:
    """Chat with the AI agent.

    Supports both streaming (SSE) and non-streaming responses.
    Set `stream: true` in the request body for SSE streaming.

    The conversation_id is used as a thread_id for LangGraph's checkpointing,
    which automatically maintains conversation history across requests.
    Conversations are tracked in the database for the chat history UI.

    API keys are resolved in this order:
    1. Team-level key from Infisical (if organization_id and team_id provided)
    2. Org-level key from Infisical (if organization_id provided)
    3. Environment variable fallback

    When organization_id is provided, the user must be a member of that organization.
    """
    has_org_context = request.organization_id is not None
    if not settings.has_llm_api_key and not settings.infisical_enabled:
        raise HTTPException(
            status_code=503,
            detail="No LLM API key configured. Configure via Infisical or set environment variables.",
        )

    # Verify organization membership when org context is provided
    if has_org_context:
        org_id = uuid.UUID(request.organization_id)
        statement = select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
        membership = session.exec(statement).first()
        if not membership:
            raise HTTPException(
                status_code=403,
                detail="Not a member of this organization",
            )

    if has_org_context and settings.infisical_enabled:
        secrets = get_secrets_service()
        statuses = secrets.list_api_key_status(
            org_id=request.organization_id,
            team_id=request.team_id,
        )
        if not any(s["is_configured"] for s in statuses):
            raise HTTPException(
                status_code=503,
                detail="No LLM API key configured for this organization/team. Set up API keys in settings.",
            )

    is_new_conversation = request.conversation_id is None
    conversation_id = request.conversation_id or str(uuid.uuid4())

    if is_new_conversation:
        title = request.message[:MAX_MESSAGE_HISTORY] + (
            "..." if len(request.message) > MAX_MESSAGE_HISTORY else ""
        )
        create_conversation_with_id(
            session=session,
            conversation_id=uuid.UUID(conversation_id),
            title=title,
            user_id=current_user.id,
            organization_id=uuid.UUID(request.organization_id)
            if request.organization_id
            else None,
            team_id=uuid.UUID(request.team_id) if request.team_id else None,
        )
    else:
        existing = get_conversation(
            session=session, conversation_id=uuid.UUID(conversation_id)
        )
        if existing:
            is_owner = current_user.id in (existing.user_id, existing.created_by_id)
            team_matches = True
            if existing.team_id and request.team_id:
                team_matches = str(existing.team_id) == request.team_id
            if not is_owner or not team_matches:
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized to access this conversation",
                )
            touch_conversation(
                session=session, conversation_id=uuid.UUID(conversation_id)
            )

    logger.info(
        "chat_request",
        conversation_id=conversation_id,
        stream=request.stream,
        message_length=len(request.message),
        user_id=str(current_user.id),
        is_new=is_new_conversation,
    )

    # Build media_json from media_ids if present
    media_json = None
    if request.media_ids:
        media_list = []
        for media_id_str in request.media_ids:
            try:
                media = get_chat_media(session, uuid.UUID(media_id_str))
                if media:
                    # Determine media type based on mime_type
                    media_type = "image"
                    if media.mime_type and (
                        media.mime_type.startswith("application/pdf")
                        or media.mime_type.startswith("text/")
                    ):
                        media_type = "document"
                    media_list.append(
                        {
                            "id": str(media.id),
                            "filename": media.filename,
                            "mime_type": media.mime_type,
                            "type": media_type,
                        }
                    )
            except Exception as e:
                logger.warning(
                    "failed_to_fetch_media_for_index",
                    media_id=media_id_str,
                    error=str(e),
                )
        if media_list:
            media_json = json.dumps(media_list)

    # Index user message for search
    try:
        create_conversation_message(
            session=session,
            conversation_id=uuid.UUID(conversation_id),
            role="user",
            content=request.message,
            organization_id=uuid.UUID(request.organization_id)
            if request.organization_id
            else None,
            team_id=uuid.UUID(request.team_id) if request.team_id else None,
            created_by_id=current_user.id,
            media_json=media_json,
        )
    except Exception as e:
        logger.warning(
            "failed_to_index_user_message",
            error=str(e),
            conversation_id=conversation_id,
        )

    if request.stream:
        return EventSourceResponse(
            stream_response(
                message=request.message,
                conversation_id=conversation_id,
                is_new_conversation=is_new_conversation,
                org_id=request.organization_id,
                team_id=request.team_id,
                user_id=str(current_user.id),
                current_user=current_user,
                session=session,
                media_ids=request.media_ids,
            ),
            media_type="text/event-stream",
        )

    # Non-streaming path with guardrails
    guardrails = None
    effective_message = request.message

    # Check input guardrails before calling LLM
    if has_org_context:
        try:
            guardrails = get_effective_guardrails(
                session=session,
                user_id=current_user.id,
                organization_id=uuid.UUID(request.organization_id),
                team_id=uuid.UUID(request.team_id) if request.team_id else None,
            )

            if guardrails.guardrails_enabled:
                input_result = check_input(request.message, guardrails)

                if not input_result.passed:
                    # Persist the guardrail block as an assistant message
                    block_message = (
                        input_result.message or "Message blocked by content policy"
                    )
                    try:
                        create_conversation_message(
                            session=session,
                            conversation_id=uuid.UUID(conversation_id),
                            role="assistant",
                            content=block_message,
                            organization_id=uuid.UUID(request.organization_id)
                            if request.organization_id
                            else None,
                            team_id=uuid.UUID(request.team_id)
                            if request.team_id
                            else None,
                            created_by_id=current_user.id,
                            guardrail_blocked=True,
                        )
                    except Exception as e:
                        logger.warning(
                            "failed_to_index_guardrail_block",
                            error=str(e),
                            conversation_id=conversation_id,
                        )
                    # Return the block message as a response instead of raising
                    return ChatResponse(
                        message=block_message,
                        conversation_id=conversation_id,
                    )

                if input_result.action == GuardrailAction.REDACT:
                    effective_message = input_result.redacted_content or request.message
                    logger.info(
                        "guardrail_input_redacted_sync",
                        conversation_id=conversation_id,
                        match_count=len(input_result.matches),
                    )
                elif input_result.action == GuardrailAction.WARN:
                    logger.warning(
                        "guardrail_input_warning_sync",
                        conversation_id=conversation_id,
                        match_count=len(input_result.matches),
                    )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(
                "guardrail_input_check_failed_sync",
                error=str(e),
                conversation_id=conversation_id,
            )

    try:
        if has_org_context:
            response = await run_agent_with_context(
                message=effective_message,
                org_id=request.organization_id,
                team_id=request.team_id,
                thread_id=conversation_id,
                user_id=str(current_user.id),
                media_ids=request.media_ids,
            )
        else:
            response = await run_agent(
                effective_message,
                thread_id=conversation_id,
                user_id=str(current_user.id),
            )

        # Check output guardrails
        stored_response = response
        if guardrails and guardrails.guardrails_enabled and response:
            try:
                output_result = check_output(response, guardrails)
                if not output_result.passed:
                    raise HTTPException(
                        status_code=500,
                        detail="Response blocked by content policy",
                    )
                if output_result.action == GuardrailAction.REDACT:
                    stored_response = output_result.redacted_content or response
                    response = stored_response  # Return redacted to user
                    logger.info(
                        "guardrail_output_redacted_sync",
                        conversation_id=conversation_id,
                        match_count=len(output_result.matches),
                    )
                elif output_result.action == GuardrailAction.WARN:
                    logger.warning(
                        "guardrail_output_warning_sync",
                        conversation_id=conversation_id,
                        match_count=len(output_result.matches),
                    )
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(
                    "guardrail_output_check_failed_sync",
                    error=str(e),
                    conversation_id=conversation_id,
                )

        if is_new_conversation:
            await _update_conversation_title(
                conversation_id=conversation_id,
                user_message=request.message,
                assistant_response=response,
                org_id=request.organization_id,
                team_id=request.team_id,
            )

        # Index assistant response for search
        try:
            create_conversation_message(
                session=session,
                conversation_id=uuid.UUID(conversation_id),
                role="assistant",
                content=stored_response,
                organization_id=uuid.UUID(request.organization_id)
                if request.organization_id
                else None,
                team_id=uuid.UUID(request.team_id) if request.team_id else None,
                created_by_id=current_user.id,
            )
        except Exception as e:
            logger.warning(
                "failed_to_index_assistant_message",
                error=str(e),
                conversation_id=conversation_id,
            )

        return ChatResponse(
            message=response,
            conversation_id=conversation_id,
        )
    except (AgentError, LLMError) as e:
        logger.exception("agent_error", error=str(e), error_type=type(e).__name__)
        raise HTTPException(status_code=500, detail="Agent processing failed") from e
    except ValueError as e:
        logger.exception("agent_validation_error", error=str(e))
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ConnectionError as e:
        logger.exception("agent_connection_error", error=str(e))
        raise HTTPException(status_code=503, detail="LLM service unavailable") from e
    except Exception as e:
        logger.exception(
            "agent_unexpected_error", error=str(e), error_type=type(e).__name__
        )
        raise HTTPException(
            status_code=500, detail="An unexpected error occurred"
        ) from e


async def _update_conversation_title(
    conversation_id: str,
    user_message: str,
    assistant_response: str,
    org_id: str | None = None,
    team_id: str | None = None,
) -> str | None:
    """Generate and update conversation title using LLM.

    This runs as a background task to not block the response.
    """
    try:
        title = await generate_conversation_title(
            user_message,
            assistant_response,
            org_id=org_id,
            team_id=team_id,
        )
        logger.info(
            "generated_conversation_title",
            conversation_id=conversation_id,
            title=title,
        )
    except (LLMError, ConnectionError) as e:
        logger.warning(
            "title_generation_error", error=str(e), error_type=type(e).__name__
        )
        return None
    except Exception as e:
        logger.warning(
            "title_generation_unexpected_error",
            error=str(e),
            error_type=type(e).__name__,
        )
        title = None
    else:
        return title

    return title


async def _extract_memories_background(
    user_message: str,
    assistant_response: str,
    org_id: str,
    team_id: str | None,
    user_id: str,
    conversation_id: str | None = None,
) -> None:
    """Extract and store memories from a conversation exchange.

    Runs as a background task to not block the response.
    Checks if memory is enabled before extraction.
    """
    try:
        # Check if memory is enabled via settings hierarchy
        with Session(engine) as session:
            effective = get_effective_settings(
                session=session,
                user_id=uuid.UUID(user_id),
                organization_id=uuid.UUID(org_id) if org_id else None,
                team_id=uuid.UUID(team_id) if team_id else None,
            )

            if not effective.memory_enabled:
                logger.debug(
                    "memory_extraction_skipped",
                    reason="disabled",
                    user_id=user_id,
                    org_id=org_id,
                )
                return

        # Extract and store memories
        stored_count = await extract_and_store_memories(
            user_message=user_message,
            assistant_response=assistant_response,
            org_id=org_id,
            team_id=team_id or "default",
            user_id=user_id,
            conversation_id=conversation_id,
        )

        if stored_count > 0:
            logger.info(
                "memories_extracted_background",
                stored_count=stored_count,
                conversation_id=conversation_id,
                user_id=user_id,
            )

    except Exception as e:
        # Don't propagate errors from background task
        logger.warning(
            "memory_extraction_background_error",
            error=str(e),
            error_type=type(e).__name__,
            user_id=user_id,
            org_id=org_id,
        )


async def stream_response(
    message: str,
    conversation_id: str,
    is_new_conversation: bool = False,
    org_id: str | None = None,
    team_id: str | None = None,
    user_id: str | None = None,
    current_user=None,
    session=None,
    media_ids: list[str] | None = None,
):
    """Generate SSE events for streaming response.

    Events:
    - message: Token chunks from the LLM response
    - tool_approval: Agent is waiting for user approval of an MCP tool call
    - title: Generated conversation title (for new conversations)
    - done: Streaming completed successfully
    - error: An error occurred
    """
    full_response = ""
    is_interrupted = False
    collected_sources: list[dict] = []  # Track sources for persistence
    guardrails = None
    effective_message = message

    # Check input guardrails before calling LLM
    if org_id and user_id and session:
        try:
            guardrails = get_effective_guardrails(
                session=session,
                user_id=uuid.UUID(user_id),
                organization_id=uuid.UUID(org_id),
                team_id=uuid.UUID(team_id) if team_id else None,
            )

            if guardrails.guardrails_enabled:
                input_result = check_input(message, guardrails)

                if not input_result.passed:
                    # Input blocked - persist as assistant message and return block event
                    block_message = (
                        input_result.message or "Message blocked by content policy"
                    )
                    logger.warning(
                        "guardrail_input_blocked",
                        conversation_id=conversation_id,
                        match_count=len(input_result.matches),
                    )
                    # Persist the guardrail block for conversation history
                    if session:
                        try:
                            create_conversation_message(
                                session=session,
                                conversation_id=uuid.UUID(conversation_id),
                                role="assistant",
                                content=block_message,
                                organization_id=uuid.UUID(org_id) if org_id else None,
                                team_id=uuid.UUID(team_id) if team_id else None,
                                created_by_id=uuid.UUID(user_id) if user_id else None,
                                guardrail_blocked=True,
                            )
                        except Exception as e:
                            logger.warning(
                                "failed_to_index_guardrail_block_stream",
                                error=str(e),
                                conversation_id=conversation_id,
                            )
                    # Send guardrail_block event (not error) so frontend can display it properly
                    yield {
                        "event": "guardrail_block",
                        "data": json.dumps(
                            {
                                "message": block_message,
                                "conversation_id": conversation_id,
                            }
                        ),
                    }
                    yield {
                        "event": "done",
                        "data": json.dumps({"conversation_id": conversation_id}),
                    }
                    return

                if input_result.action == GuardrailAction.REDACT:
                    # Use redacted message for LLM
                    effective_message = input_result.redacted_content or message
                    logger.info(
                        "guardrail_input_redacted",
                        conversation_id=conversation_id,
                        match_count=len(input_result.matches),
                    )
                elif input_result.action == GuardrailAction.WARN:
                    logger.warning(
                        "guardrail_input_warning",
                        conversation_id=conversation_id,
                        match_count=len(input_result.matches),
                    )
        except Exception as e:
            logger.warning(
                "guardrail_input_check_failed",
                error=str(e),
                conversation_id=conversation_id,
            )

    try:
        if org_id:
            stream_gen = stream_agent_with_context(
                effective_message,
                org_id=org_id,
                team_id=team_id,
                thread_id=conversation_id,
                user_id=user_id,
                media_ids=media_ids,
            )
        else:
            stream_gen = stream_agent(
                effective_message, thread_id=conversation_id, user_id=user_id
            )

        async for chunk in stream_gen:
            # Check if this is a special event (dict) or a token (str)
            if isinstance(chunk, dict):
                event_type = chunk.get("type")

                if event_type == "tool_approval":
                    # Emit tool approval event with interrupt data
                    is_interrupted = True
                    tool_name = chunk["data"].get("tool_name")
                    tool_args = chunk["data"].get("tool_args", {})
                    tool_call_id = chunk["data"].get("tool_call_id")

                    yield {
                        "event": "tool_approval",
                        "data": json.dumps(
                            {
                                "conversation_id": conversation_id,
                                "tool_name": tool_name,
                                "tool_args": tool_args,
                                "tool_call_id": tool_call_id,
                                "tool_description": chunk["data"].get(
                                    "tool_description", ""
                                ),
                            }
                        ),
                    }
                    logger.info(
                        "tool_approval_event_sent",
                        conversation_id=conversation_id,
                        tool_name=tool_name,
                    )

                    # Audit log the tool approval request
                    await audit_service.log(
                        AuditAction.TOOL_APPROVAL_REQUESTED,
                        actor=current_user,
                        organization_id=uuid.UUID(org_id) if org_id else None,
                        team_id=uuid.UUID(team_id) if team_id else None,
                        targets=[
                            Target(type="conversation", id=conversation_id),
                            Target(type="tool", id=tool_call_id, name=tool_name),
                        ],
                        metadata={
                            "tool_name": tool_name,
                            "tool_args": tool_args,
                        },
                    )

                elif event_type == "sources":
                    # Emit sources event for RAG citation display
                    sources = chunk.get("data", [])
                    collected_sources.extend(sources)  # Track for persistence
                    yield {
                        "event": "sources",
                        "data": json.dumps(
                            {
                                "conversation_id": conversation_id,
                                "sources": sources,
                            }
                        ),
                    }
                    logger.info(
                        "sources_event_sent",
                        conversation_id=conversation_id,
                        source_count=len(sources),
                    )
            else:
                # Regular token
                full_response += chunk
                yield {
                    "event": "message",
                    "data": json.dumps(
                        {"token": chunk, "conversation_id": conversation_id}
                    ),
                }

        # Only do post-processing if we weren't interrupted
        if not is_interrupted:
            # Check output guardrails on full response
            stored_response = full_response
            if guardrails and guardrails.guardrails_enabled and full_response:
                try:
                    output_result = check_output(full_response, guardrails)
                    if not output_result.passed:
                        # Output blocked - log warning (response already streamed)
                        logger.warning(
                            "guardrail_output_blocked_post_stream",
                            conversation_id=conversation_id,
                            match_count=len(output_result.matches),
                        )
                    elif output_result.action == GuardrailAction.REDACT:
                        # Apply redactions to stored content
                        stored_response = (
                            output_result.redacted_content or full_response
                        )
                        logger.info(
                            "guardrail_output_redacted",
                            conversation_id=conversation_id,
                            match_count=len(output_result.matches),
                        )
                    elif output_result.action == GuardrailAction.WARN:
                        logger.warning(
                            "guardrail_output_warning",
                            conversation_id=conversation_id,
                            match_count=len(output_result.matches),
                        )
                except Exception as e:
                    logger.warning(
                        "guardrail_output_check_failed",
                        error=str(e),
                        conversation_id=conversation_id,
                    )

            if is_new_conversation and full_response:
                title = await _update_conversation_title(
                    conversation_id=conversation_id,
                    user_message=message,
                    assistant_response=full_response,
                    org_id=org_id,
                    team_id=team_id,
                )
                if title:
                    yield {
                        "event": "title",
                        "data": json.dumps(
                            {"title": title, "conversation_id": conversation_id}
                        ),
                    }

            # Index assistant response for search (with sources for citation display)
            if stored_response and session:
                try:
                    sources_json = (
                        json.dumps(collected_sources) if collected_sources else None
                    )
                    create_conversation_message(
                        session=session,
                        conversation_id=uuid.UUID(conversation_id),
                        role="assistant",
                        content=stored_response,
                        organization_id=uuid.UUID(org_id) if org_id else None,
                        team_id=uuid.UUID(team_id) if team_id else None,
                        created_by_id=uuid.UUID(user_id) if user_id else None,
                        sources_json=sources_json,
                    )
                    if collected_sources:
                        logger.info(
                            "sources_persisted",
                            conversation_id=conversation_id,
                            source_count=len(collected_sources),
                        )
                except Exception as e:
                    logger.warning(
                        "failed_to_index_assistant_message_stream",
                        error=str(e),
                        conversation_id=conversation_id,
                    )

            # Extract and store memories in background (don't block response)
            if full_response and org_id and user_id:
                logger.info(
                    "memory_extraction_task_creating",
                    org_id=org_id,
                    team_id=team_id,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    response_length=len(full_response),
                )
                # Store task reference to prevent garbage collection
                task = asyncio.create_task(
                    _extract_memories_background(
                        user_message=message,
                        assistant_response=full_response,
                        org_id=org_id,
                        team_id=team_id,
                        user_id=user_id,
                        conversation_id=conversation_id,
                    )
                )
                _background_tasks.add(task)
                task.add_done_callback(_background_tasks.discard)
            else:
                logger.info(
                    "memory_extraction_skipped_no_context",
                    has_response=bool(full_response),
                    has_org_id=bool(org_id),
                    has_user_id=bool(user_id),
                )

            yield {
                "event": "done",
                "data": json.dumps({"conversation_id": conversation_id}),
            }

    except LLMConfigurationError as e:
        # Configuration errors have user-friendly messages - pass them through
        logger.warning(
            "stream_llm_config_error", error=str(e), error_type=type(e).__name__
        )
        yield {
            "event": "error",
            "data": json.dumps({"error": str(e), "type": "configuration_error"}),
        }
    except ValueError as e:
        # Check if this is an API key configuration error from the LLM layer
        error_msg = str(e)
        if "API key" in error_msg or "api_key" in error_msg.lower():
            logger.warning(
                "stream_api_key_error", error=error_msg, error_type=type(e).__name__
            )
            yield {
                "event": "error",
                "data": json.dumps({"error": error_msg, "type": "configuration_error"}),
            }
        else:
            logger.exception(
                "stream_value_error", error=error_msg, error_type=type(e).__name__
            )
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "error": "An unexpected error occurred",
                        "type": "unexpected_error",
                    }
                ),
            }
    except (AgentError, LLMError) as e:
        logger.exception(
            "stream_agent_error", error=str(e), error_type=type(e).__name__
        )
        yield {
            "event": "error",
            "data": json.dumps(
                {"error": "Agent processing failed", "type": "agent_error"}
            ),
        }
    except ConnectionError as e:
        logger.exception("stream_connection_error", error=str(e))
        yield {
            "event": "error",
            "data": json.dumps(
                {"error": "LLM service unavailable", "type": "connection_error"}
            ),
        }
    except Exception as e:
        logger.exception(
            "stream_unexpected_error", error=str(e), error_type=type(e).__name__
        )
        yield {
            "event": "error",
            "data": json.dumps(
                {"error": "An unexpected error occurred", "type": "unexpected_error"}
            ),
        }


@router.patch("/conversations/{conversation_id}/title")
async def update_title(
    conversation_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    title: Annotated[str, Query(description="New title for the conversation")],
) -> dict:
    """Update the title of a conversation.

    Used after the first message to set a generated summary title.
    """
    existing = get_conversation(
        session=session, conversation_id=uuid.UUID(conversation_id)
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Conversation not found")
    is_owner = current_user.id in (existing.user_id, existing.created_by_id)
    if not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this conversation",
        )

    update_conversation(
        session=session,
        db_conversation=existing,
        conversation_in=ConversationUpdate(title=title),
    )

    logger.info(
        "conversation_title_updated",
        conversation_id=conversation_id,
        title=title,
    )

    return {"success": True, "title": title}


@router.get(
    "/conversations/{conversation_id}/history", response_model=list[ChatMessage]
)
async def get_history(
    conversation_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[ChatMessage]:
    """Get conversation history for a specific thread.

    Returns the full message history for the given conversation_id,
    including RAG sources for citation display on assistant messages.

    Primary source is our conversation_message index table (has sources).
    Falls back to LangGraph checkpointer if index is empty.
    """
    existing = get_conversation(
        session=session, conversation_id=uuid.UUID(conversation_id)
    )
    if existing:
        is_owner = current_user.id in (existing.user_id, existing.created_by_id)
        if not is_owner:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this conversation",
            )

    # Try to get messages from our index (has sources)
    indexed_messages = get_conversation_messages(
        session=session,
        conversation_id=uuid.UUID(conversation_id),
    )

    if indexed_messages:
        # Use indexed messages which include sources and media
        result = []
        for msg in indexed_messages:
            sources = None
            media = None

            if msg.sources_json:
                try:
                    parsed_sources = json.loads(msg.sources_json)
                    # Fix any sources where metadata is still a JSON string
                    if parsed_sources:
                        for source in parsed_sources:
                            if isinstance(source.get("metadata"), str):
                                try:
                                    source["metadata"] = json.loads(source["metadata"])
                                except (json.JSONDecodeError, TypeError):
                                    source["metadata"] = None
                    sources = parsed_sources
                except json.JSONDecodeError:
                    logger.warning(
                        "failed_to_parse_sources_json",
                        conversation_id=conversation_id,
                        message_id=str(msg.id),
                    )

            if msg.media_json:
                try:
                    media = json.loads(msg.media_json)
                except json.JSONDecodeError:
                    logger.warning(
                        "failed_to_parse_media_json",
                        conversation_id=conversation_id,
                        message_id=str(msg.id),
                    )

            result.append(
                ChatMessage(
                    role=msg.role,
                    content=msg.content,
                    sources=sources,
                    media=media,
                    guardrail_blocked=msg.guardrail_blocked,
                )
            )
        return result

    # Fallback to LangGraph checkpointer (no sources)
    history = await get_conversation_history(conversation_id)
    return [ChatMessage(**msg) for msg in history]


@router.get(
    "/conversations/{conversation_id}/pending-approval",
    response_model=ToolApprovalInfo | None,
)
async def get_pending_approval(
    conversation_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[str, Query(description="Organization ID")],
    team_id: Annotated[str | None, Query(description="Team ID")] = None,
) -> ToolApprovalInfo | None:
    """Get pending tool approval info for a conversation.

    Returns the tool call details if the conversation is waiting for user approval,
    or null if no approval is pending.
    """
    existing = get_conversation(
        session=session, conversation_id=uuid.UUID(conversation_id)
    )
    if existing:
        is_owner = current_user.id in (existing.user_id, existing.created_by_id)
        if not is_owner:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this conversation",
            )

    interrupt_data = await get_interrupted_tool_call(
        thread_id=conversation_id,
        org_id=organization_id,
        team_id=team_id,
        user_id=str(current_user.id),
    )

    if not interrupt_data:
        return None

    return ToolApprovalInfo(
        conversation_id=conversation_id,
        tool_name=interrupt_data.get("tool_name", ""),
        tool_args=interrupt_data.get("tool_args", {}),
        tool_call_id=interrupt_data.get("tool_call_id"),
        tool_description=interrupt_data.get("tool_description", ""),
    )


@router.post("/resume", response_model=None)
async def resume_conversation(
    approval_request: ToolApprovalRequest,
    session: SessionDep,
    current_user: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
):
    """Resume a conversation after tool approval decision.

    This endpoint is called after the user approves or rejects a pending MCP tool call.
    The agent will continue execution based on the user's decision.

    Supports both streaming (SSE) and non-streaming responses.
    """
    # Verify conversation exists and user owns it
    existing = get_conversation(
        session=session, conversation_id=uuid.UUID(approval_request.conversation_id)
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_owner = current_user.id in (existing.user_id, existing.created_by_id)
    if not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to access this conversation",
        )

    # Verify organization membership
    org_id = uuid.UUID(approval_request.organization_id)
    statement = select(OrganizationMember).where(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(statement).first()
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Not a member of this organization",
        )

    logger.info(
        "resume_request",
        conversation_id=approval_request.conversation_id,
        approved=approval_request.approved,
        stream=approval_request.stream,
        user_id=str(current_user.id),
    )

    # Get pending tool info for audit logging
    pending_tool = await get_interrupted_tool_call(
        thread_id=approval_request.conversation_id,
        org_id=approval_request.organization_id,
        team_id=approval_request.team_id,
        user_id=str(current_user.id),
    )

    # Audit log the approval/denial decision
    audit_action = (
        AuditAction.TOOL_APPROVAL_GRANTED
        if approval_request.approved
        else AuditAction.TOOL_APPROVAL_DENIED
    )
    await audit_service.log(
        audit_action,
        actor=current_user,
        organization_id=org_id,
        team_id=uuid.UUID(approval_request.team_id)
        if approval_request.team_id
        else None,
        targets=[
            Target(type="conversation", id=approval_request.conversation_id),
            Target(
                type="tool",
                id=pending_tool.get("tool_call_id") if pending_tool else None,
                name=pending_tool.get("tool_name") if pending_tool else "unknown",
            ),
        ],
        metadata={
            "tool_name": pending_tool.get("tool_name") if pending_tool else "unknown",
            "tool_args": pending_tool.get("tool_args", {}) if pending_tool else {},
            "approved": approval_request.approved,
        },
    )

    if approval_request.stream:
        return EventSourceResponse(
            stream_resume_response(
                conversation_id=approval_request.conversation_id,
                org_id=approval_request.organization_id,
                team_id=approval_request.team_id,
                user_id=str(current_user.id),
                approved=approval_request.approved,
                current_user=current_user,
            ),
            media_type="text/event-stream",
        )

    # Non-streaming resume (less common for HITL)
    try:
        full_response = ""
        async for chunk in resume_agent_with_context(
            thread_id=approval_request.conversation_id,
            org_id=approval_request.organization_id,
            team_id=approval_request.team_id,
            user_id=str(current_user.id),
            approved=approval_request.approved,
        ):
            if isinstance(chunk, str):
                full_response += chunk

        return ChatResponse(
            message=full_response,
            conversation_id=approval_request.conversation_id,
        )
    except Exception as e:
        logger.exception("resume_error", error=str(e))
        raise HTTPException(
            status_code=500, detail="Failed to resume conversation"
        ) from e


async def stream_resume_response(
    conversation_id: str,
    org_id: str,
    team_id: str | None,
    user_id: str,
    approved: bool,
    current_user=None,
):
    """Generate SSE events for resume streaming response.

    Events are the same as stream_response:
    - message: Token chunks from the LLM response
    - tool_approval: Another tool call needs approval (if agent calls more tools)
    - done: Streaming completed successfully
    - error: An error occurred
    """
    full_response = ""
    is_interrupted = False
    try:
        async for chunk in resume_agent_with_context(
            thread_id=conversation_id,
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            approved=approved,
        ):
            # Check if this is a tool approval interrupt (dict) or a token (str)
            if isinstance(chunk, dict) and chunk.get("type") == "tool_approval":
                is_interrupted = True
                tool_name = chunk["data"].get("tool_name")
                tool_args = chunk["data"].get("tool_args", {})
                tool_call_id = chunk["data"].get("tool_call_id")

                yield {
                    "event": "tool_approval",
                    "data": json.dumps(
                        {
                            "conversation_id": conversation_id,
                            "tool_name": tool_name,
                            "tool_args": tool_args,
                            "tool_call_id": tool_call_id,
                            "tool_description": chunk["data"].get(
                                "tool_description", ""
                            ),
                        }
                    ),
                }
                logger.info(
                    "tool_approval_event_sent_on_resume",
                    conversation_id=conversation_id,
                    tool_name=tool_name,
                )

                # Audit log the tool approval request
                await audit_service.log(
                    AuditAction.TOOL_APPROVAL_REQUESTED,
                    actor=current_user,
                    organization_id=uuid.UUID(org_id) if org_id else None,
                    team_id=uuid.UUID(team_id) if team_id else None,
                    targets=[
                        Target(type="conversation", id=conversation_id),
                        Target(type="tool", id=tool_call_id, name=tool_name),
                    ],
                    metadata={
                        "tool_name": tool_name,
                        "tool_args": tool_args,
                    },
                )
            else:
                full_response += chunk
                yield {
                    "event": "message",
                    "data": json.dumps(
                        {"token": chunk, "conversation_id": conversation_id}
                    ),
                }

        if not is_interrupted:
            # Extract memories in background if we have a complete response
            if full_response and org_id and user_id:
                # Note: We don't have the original user message here, so we skip memory extraction
                # The memory was already extracted from the initial message
                pass

            yield {
                "event": "done",
                "data": json.dumps({"conversation_id": conversation_id}),
            }

    except LLMConfigurationError as e:
        # Configuration errors have user-friendly messages - pass them through
        logger.warning(
            "stream_resume_config_error",
            error=str(e),
            conversation_id=conversation_id,
        )
        yield {
            "event": "error",
            "data": json.dumps({"error": str(e), "type": "configuration_error"}),
        }
    except ValueError as e:
        # Check if this is an API key configuration error from the LLM layer
        error_msg = str(e)
        if "API key" in error_msg or "api_key" in error_msg.lower():
            logger.warning(
                "stream_resume_api_key_error",
                error=error_msg,
                conversation_id=conversation_id,
            )
            yield {
                "event": "error",
                "data": json.dumps({"error": error_msg, "type": "configuration_error"}),
            }
        else:
            logger.exception(
                "stream_resume_error",
                error=error_msg,
                conversation_id=conversation_id,
            )
            yield {
                "event": "error",
                "data": json.dumps(
                    {"error": "Failed to resume conversation", "type": "resume_error"}
                ),
            }
    except Exception as e:
        logger.exception(
            "stream_resume_error", error=str(e), conversation_id=conversation_id
        )
        yield {
            "event": "error",
            "data": json.dumps(
                {"error": "Failed to resume conversation", "type": "resume_error"}
            ),
        }
