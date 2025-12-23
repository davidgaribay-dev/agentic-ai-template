from typing import Annotated, Any
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth import CurrentUser, Message, SessionDep
from backend.conversations import (
    ConversationCreate,
    ConversationPublic,
    ConversationsPublic,
    ConversationUpdate,
    create_conversation,
    get_conversation,
    get_conversations_by_team,
    get_conversations_by_user,
    search_conversations_by_team,
    set_star_conversation,
    soft_delete_conversation,
    update_conversation,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/", response_model=ConversationsPublic)
def read_conversations(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    team_id: Annotated[uuid.UUID | None, Query(description="Filter by team ID")] = None,
    search: Annotated[
        str | None, Query(description="Search in conversation titles and messages")
    ] = None,
) -> Any:
    """Retrieve conversations for chat history.

    If team_id is provided, returns conversations scoped to that team.
    Otherwise falls back to user-owned conversations (legacy behavior).

    If search is provided with team_id, searches both conversation titles and message content.
    Search results are ordered by starred status first, then by most recently updated.

    Returns conversations ordered by most recently updated first (or by relevance if searching).
    """
    # Search requires team_id for proper scoping
    if search and team_id:
        conversations, count = search_conversations_by_team(
            session=session,
            team_id=team_id,
            user_id=current_user.id,
            search_query=search,
            skip=skip,
            limit=limit,
        )
    elif team_id:
        conversations, count = get_conversations_by_team(
            session=session,
            team_id=team_id,
            user_id=current_user.id,
            skip=skip,
            limit=limit,
        )
    else:
        conversations, count = get_conversations_by_user(
            session=session, user_id=current_user.id, skip=skip, limit=limit
        )
    return ConversationsPublic(data=conversations, count=count)  # type: ignore[arg-type]


@router.post("/", response_model=ConversationPublic)
async def create_conversation_endpoint(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    conversation_in: ConversationCreate,
    organization_id: Annotated[
        uuid.UUID | None, Query(description="Organization ID")
    ] = None,
    team_id: Annotated[uuid.UUID | None, Query(description="Team ID")] = None,
) -> Any:
    """Create a new conversation."""
    conversation = create_conversation(
        session=session,
        conversation_in=conversation_in,
        user_id=current_user.id,
        organization_id=organization_id,
        team_id=team_id,
    )

    await audit_service.log(
        AuditAction.CONVERSATION_CREATED,
        actor=current_user,
        request=request,
        organization_id=organization_id,
        team_id=team_id,
        targets=[
            Target(
                type="conversation", id=str(conversation.id), name=conversation.title
            )
        ],
        metadata={
            "has_organization": organization_id is not None,
            "has_team": team_id is not None,
        },
    )

    return conversation


@router.get("/{conversation_id}", response_model=ConversationPublic)
def read_conversation(
    session: SessionDep,
    current_user: CurrentUser,
    conversation_id: uuid.UUID,
) -> Any:
    """Get a conversation by ID."""
    conversation = get_conversation(session=session, conversation_id=conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    is_owner = current_user.id in (conversation.user_id, conversation.created_by_id)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return conversation


@router.patch("/{conversation_id}", response_model=ConversationPublic)
async def update_conversation_endpoint(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    conversation_id: uuid.UUID,
    conversation_in: ConversationUpdate,
) -> Any:
    """Update a conversation's title."""
    conversation = get_conversation(session=session, conversation_id=conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    is_owner = current_user.id in (conversation.user_id, conversation.created_by_id)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )

    old_title = conversation.title
    conversation = update_conversation(
        session=session, db_conversation=conversation, conversation_in=conversation_in
    )

    await audit_service.log(
        AuditAction.CONVERSATION_UPDATED,
        actor=current_user,
        request=request,
        organization_id=conversation.organization_id,
        team_id=conversation.team_id,
        targets=[
            Target(
                type="conversation", id=str(conversation.id), name=conversation.title
            )
        ],
        changes={
            "before": {"title": old_title},
            "after": {"title": conversation.title},
        },
    )

    return conversation


@router.delete("/{conversation_id}", response_model=Message)
async def delete_conversation_endpoint(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    conversation_id: uuid.UUID,
) -> Any:
    """Soft delete a conversation (sets deleted_at timestamp)."""
    conversation = get_conversation(session=session, conversation_id=conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    is_owner = current_user.id in (conversation.user_id, conversation.created_by_id)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )

    conv_title = conversation.title
    conv_org_id = conversation.organization_id
    conv_team_id = conversation.team_id

    soft_delete_conversation(session=session, db_conversation=conversation)

    await audit_service.log(
        AuditAction.CONVERSATION_DELETED,
        actor=current_user,
        request=request,
        organization_id=conv_org_id,
        team_id=conv_team_id,
        targets=[Target(type="conversation", id=str(conversation_id), name=conv_title)],
        metadata={"deletion_type": "soft_delete"},
    )

    return Message(message="Conversation deleted successfully")


@router.post("/{conversation_id}/star", response_model=ConversationPublic)
async def star_conversation_endpoint(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    conversation_id: uuid.UUID,
    is_starred: Annotated[bool, Query(description="Set starred status")] = True,
) -> Any:
    """Star or unstar a conversation."""
    conversation = get_conversation(session=session, conversation_id=conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    is_owner = current_user.id in (conversation.user_id, conversation.created_by_id)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    conversation = set_star_conversation(
        session=session, db_conversation=conversation, is_starred=is_starred
    )

    action = (
        AuditAction.CONVERSATION_STARRED
        if is_starred
        else AuditAction.CONVERSATION_UNSTARRED
    )
    await audit_service.log(
        action,
        actor=current_user,
        request=request,
        organization_id=conversation.organization_id,
        team_id=conversation.team_id,
        targets=[
            Target(
                type="conversation", id=str(conversation.id), name=conversation.title
            )
        ],
    )

    return conversation
