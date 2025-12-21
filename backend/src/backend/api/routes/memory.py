"""Memory API routes for managing user memories.

Provides endpoints for:
- Listing user memories
- Deleting individual memories
- Clearing all memories

All operations are scoped to the current user with optional org/team context.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.audit import audit_service
from backend.audit.schemas import LogLevel, Target
from backend.auth.deps import CurrentUser
from backend.core.logging import get_logger
from backend.memory.service import MemoryService
from backend.memory.store import get_memory_store

logger = get_logger(__name__)

router = APIRouter(prefix="/memory", tags=["memory"])


class MemoryResponse(BaseModel):
    """Response model for a single memory."""

    id: str
    content: str
    type: str
    created_at: str
    conversation_id: str | None = None
    source: str | None = None


class MemoriesListResponse(BaseModel):
    """Response model for listing memories."""

    data: list[MemoryResponse]
    count: int


class DeleteMemoryResponse(BaseModel):
    """Response model for deleting a memory."""

    success: bool


class ClearMemoriesResponse(BaseModel):
    """Response model for clearing all memories."""

    success: bool
    deleted_count: int


@router.get(
    "/users/me/memories",
    response_model=MemoriesListResponse,
)
async def list_user_memories(
    current_user: CurrentUser,
    organization_id: Annotated[str | None, Query(alias="org_id")] = None,
    team_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MemoriesListResponse:
    """List current user's memories for the settings page.

    Memories are scoped to org/team/user namespace.
    Returns memories sorted by creation date (newest first).
    """
    org_id = organization_id or "default"
    team_id_str = team_id or "default"
    user_id = str(current_user.id)

    store = await get_memory_store()
    service = MemoryService(store)

    memories = await service.list_memories(
        org_id=org_id,
        team_id=team_id_str,
        user_id=user_id,
        limit=limit,
    )

    # Convert to response format
    memory_responses = []
    for memory in memories:
        memory_responses.append(
            MemoryResponse(
                id=memory.get("id", ""),
                content=memory.get("content", ""),
                type=memory.get("type", "fact"),
                created_at=memory.get("created_at", ""),
                conversation_id=memory.get("conversation_id"),
                source=memory.get("source"),
            )
        )

    # Audit log
    await audit_service.log(
        "memory.list",
        actor=current_user,
        organization_id=uuid.UUID(org_id) if org_id != "default" else None,
        team_id=uuid.UUID(team_id_str) if team_id_str != "default" else None,
        severity=LogLevel.INFO,
        metadata={
            "count": len(memory_responses),
            "user_id": user_id,
        },
    )

    return MemoriesListResponse(
        data=memory_responses,
        count=len(memory_responses),
    )


@router.delete(
    "/users/me/memories/{memory_id}",
    response_model=DeleteMemoryResponse,
)
async def delete_memory(
    memory_id: str,
    current_user: CurrentUser,
    organization_id: Annotated[str | None, Query(alias="org_id")] = None,
    team_id: Annotated[str | None, Query()] = None,
) -> DeleteMemoryResponse:
    """Delete a specific memory.

    The memory must belong to the current user's namespace.
    """
    org_id = organization_id or "default"
    team_id_str = team_id or "default"
    user_id = str(current_user.id)

    store = await get_memory_store()
    service = MemoryService(store)

    # Check if memory exists before deleting
    memory = await service.get_memory(
        org_id=org_id,
        team_id=team_id_str,
        user_id=user_id,
        memory_id=memory_id,
    )

    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    await service.delete_memory(
        org_id=org_id,
        team_id=team_id_str,
        user_id=user_id,
        memory_id=memory_id,
    )

    # Audit log
    await audit_service.log(
        "memory.delete",
        actor=current_user,
        targets=[Target(type="memory", id=memory_id)],
        organization_id=uuid.UUID(org_id) if org_id != "default" else None,
        team_id=uuid.UUID(team_id_str) if team_id_str != "default" else None,
        severity=LogLevel.INFO,
        metadata={
            "memory_id": memory_id,
            "user_id": user_id,
        },
    )

    logger.info(
        "memory_deleted_via_api",
        memory_id=memory_id,
        user_id=user_id,
        org_id=org_id,
        team_id=team_id_str,
    )

    return DeleteMemoryResponse(success=True)


@router.delete(
    "/users/me/memories",
    response_model=ClearMemoriesResponse,
)
async def clear_all_memories(
    current_user: CurrentUser,
    organization_id: Annotated[str | None, Query(alias="org_id")] = None,
    team_id: Annotated[str | None, Query()] = None,
) -> ClearMemoriesResponse:
    """Clear all user memories.

    Deletes all memories in the user's namespace for the given org/team context.
    """
    org_id = organization_id or "default"
    team_id_str = team_id or "default"
    user_id = str(current_user.id)

    store = await get_memory_store()
    service = MemoryService(store)

    deleted_count = await service.clear_all_memories(
        org_id=org_id,
        team_id=team_id_str,
        user_id=user_id,
    )

    # Audit log
    await audit_service.log(
        "memory.clear_all",
        actor=current_user,
        organization_id=uuid.UUID(org_id) if org_id != "default" else None,
        team_id=uuid.UUID(team_id_str) if team_id_str != "default" else None,
        severity=LogLevel.WARNING,  # Higher severity for bulk delete
        metadata={
            "deleted_count": deleted_count,
            "user_id": user_id,
        },
    )

    logger.info(
        "memories_cleared_via_api",
        deleted_count=deleted_count,
        user_id=user_id,
        org_id=org_id,
        team_id=team_id_str,
    )

    return ClearMemoriesResponse(
        success=True,
        deleted_count=deleted_count,
    )
