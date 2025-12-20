import json
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from fastapi.params import Depends
from sse_starlette.sse import EventSourceResponse

from backend.agents.base import (
    get_conversation_history,
    run_agent,
    run_agent_with_context,
    stream_agent,
    stream_agent_with_context,
)
from backend.agents.llm import generate_conversation_title
from backend.agents.schemas import ChatMessage, ChatRequest, ChatResponse, HealthResponse
from backend.auth import CurrentUser, SessionDep
from backend.conversations import (
    Conversation,
    ConversationUpdate,
    create_conversation_with_id,
    get_conversation,
    touch_conversation,
    update_conversation,
)
from backend.core.config import Settings, get_settings
from backend.core.logging import get_logger
from backend.core.secrets import get_secrets_service
from backend.organizations.models import OrganizationMember
from sqlmodel import select


class AgentError(Exception):
    """Base exception for agent-related errors."""

    pass


class LLMError(AgentError):
    """Exception for LLM/model errors."""

    pass


class StreamError(AgentError):
    """Exception for streaming errors."""

    pass

router = APIRouter(prefix="/agent", tags=["agent"])
logger = get_logger(__name__)


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
        title = request.message[:100] + ("..." if len(request.message) > 100 else "")
        create_conversation_with_id(
            session=session,
            conversation_id=uuid.UUID(conversation_id),
            title=title,
            user_id=current_user.id,
            organization_id=uuid.UUID(request.organization_id) if request.organization_id else None,
            team_id=uuid.UUID(request.team_id) if request.team_id else None,
        )
    else:
        existing = get_conversation(session=session, conversation_id=uuid.UUID(conversation_id))
        if existing:
            is_owner = existing.user_id == current_user.id or existing.created_by_id == current_user.id
            team_matches = True
            if existing.team_id and request.team_id:
                team_matches = str(existing.team_id) == request.team_id
            if not is_owner or not team_matches:
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized to access this conversation",
                )
            touch_conversation(session=session, conversation_id=uuid.UUID(conversation_id))

    logger.info(
        "chat_request",
        conversation_id=conversation_id,
        stream=request.stream,
        message_length=len(request.message),
        user_id=str(current_user.id),
        is_new=is_new_conversation,
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
            ),
            media_type="text/event-stream",
        )

    try:
        if has_org_context:
            response = await run_agent_with_context(
                message=request.message,
                org_id=request.organization_id,
                team_id=request.team_id,
                thread_id=conversation_id,
                user_id=str(current_user.id),
            )
        else:
            response = await run_agent(
                request.message,
                thread_id=conversation_id,
                user_id=str(current_user.id),
            )

        if is_new_conversation:
            await _update_conversation_title(
                conversation_id=conversation_id,
                user_message=request.message,
                assistant_response=response,
                org_id=request.organization_id,
                team_id=request.team_id,
            )

        return ChatResponse(
            message=response,
            conversation_id=conversation_id,
        )
    except (AgentError, LLMError) as e:
        logger.error("agent_error", error=str(e), error_type=type(e).__name__)
        raise HTTPException(status_code=500, detail="Agent processing failed") from e
    except ValueError as e:
        logger.error("agent_validation_error", error=str(e))
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ConnectionError as e:
        logger.error("agent_connection_error", error=str(e))
        raise HTTPException(status_code=503, detail="LLM service unavailable") from e
    except Exception as e:
        logger.exception("agent_unexpected_error", error=str(e), error_type=type(e).__name__)
        raise HTTPException(status_code=500, detail="An unexpected error occurred") from e


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
        return title
    except (LLMError, ConnectionError) as e:
        logger.warning("title_generation_error", error=str(e), error_type=type(e).__name__)
        return None
    except Exception as e:
        logger.warning(
            "title_generation_unexpected_error",
            error=str(e),
            error_type=type(e).__name__,
        )
        return None


async def stream_response(
    message: str,
    conversation_id: str,
    is_new_conversation: bool = False,
    org_id: str | None = None,
    team_id: str | None = None,
    user_id: str | None = None,
):
    """Generate SSE events for streaming response."""
    full_response = ""
    try:
        if org_id:
            stream_gen = stream_agent_with_context(
                message,
                org_id=org_id,
                team_id=team_id,
                thread_id=conversation_id,
                user_id=user_id,
            )
        else:
            stream_gen = stream_agent(message, thread_id=conversation_id, user_id=user_id)

        async for token in stream_gen:
            full_response += token
            yield {
                "event": "message",
                "data": json.dumps({"token": token, "conversation_id": conversation_id}),
            }

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
                    "data": json.dumps({"title": title, "conversation_id": conversation_id}),
                }

        yield {
            "event": "done",
            "data": json.dumps({"conversation_id": conversation_id}),
        }

    except (AgentError, LLMError) as e:
        logger.error("stream_agent_error", error=str(e), error_type=type(e).__name__)
        yield {
            "event": "error",
            "data": json.dumps({"error": "Agent processing failed", "type": "agent_error"}),
        }
    except ConnectionError as e:
        logger.error("stream_connection_error", error=str(e))
        yield {
            "event": "error",
            "data": json.dumps({"error": "LLM service unavailable", "type": "connection_error"}),
        }
    except Exception as e:
        logger.exception("stream_unexpected_error", error=str(e), error_type=type(e).__name__)
        yield {
            "event": "error",
            "data": json.dumps({"error": "An unexpected error occurred", "type": "unexpected_error"}),
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
    existing = get_conversation(session=session, conversation_id=uuid.UUID(conversation_id))
    if not existing:
        raise HTTPException(status_code=404, detail="Conversation not found")
    is_owner = existing.user_id == current_user.id or existing.created_by_id == current_user.id
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


@router.get("/conversations/{conversation_id}/history", response_model=list[ChatMessage])
async def get_history(
    conversation_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[ChatMessage]:
    """Get conversation history for a specific thread.

    Returns the full message history for the given conversation_id,
    leveraging LangGraph's built-in state management.
    """
    existing = get_conversation(session=session, conversation_id=uuid.UUID(conversation_id))
    if existing:
        is_owner = existing.user_id == current_user.id or existing.created_by_id == current_user.id
        if not is_owner:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this conversation",
            )

    history = await get_conversation_history(conversation_id)
    return [ChatMessage(**msg) for msg in history]
