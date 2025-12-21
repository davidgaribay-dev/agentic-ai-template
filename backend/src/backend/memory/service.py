"""Memory CRUD operations using LangGraph's BaseStore interface.

Provides high-level operations for storing, searching, and managing memories.
All operations are scoped to a namespace (org/team/user) for isolation.
"""

import uuid
from datetime import UTC, datetime

from langgraph.store.base import BaseStore

from backend.core.logging import get_logger
from backend.memory.store import get_memory_namespace

logger = get_logger(__name__)


class MemoryService:
    """Service for memory CRUD operations."""

    def __init__(self, store: BaseStore):
        self.store = store

    async def store_memory(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
        content: str,
        memory_type: str,
        metadata: dict | None = None,
    ) -> str:
        """Store a memory using LangGraph's put() pattern.

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation
            content: The memory content (will be embedded for search)
            memory_type: Type of memory (preference, fact, entity, relationship, summary)
            metadata: Optional additional metadata

        Returns:
            The generated memory ID
        """
        namespace = get_memory_namespace(org_id, team_id, user_id)
        memory_id = str(uuid.uuid4())

        await self.store.aput(
            namespace,
            memory_id,
            {
                "content": content,
                "type": memory_type,
                "created_at": datetime.now(UTC).isoformat(),
                **(metadata or {}),
            },
        )

        logger.info(
            "memory_stored",
            memory_id=memory_id,
            memory_type=memory_type,
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
        )

        return memory_id

    async def search_memories(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
        query: str,
        limit: int = 5,
    ) -> list[dict]:
        """Semantic search for relevant memories.

        Uses LangGraph's search() with embedding-based similarity.

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation
            query: Search query (will be embedded and compared)
            limit: Maximum number of results

        Returns:
            List of matching memories with scores
        """
        namespace = get_memory_namespace(org_id, team_id, user_id)

        results = await self.store.asearch(
            namespace,
            query=query,
            limit=limit,
        )

        memories = []
        for item in results:
            memory = {"id": item.key, **item.value}
            # Include score if available
            if hasattr(item, "score") and item.score is not None:
                memory["score"] = item.score
            memories.append(memory)

        logger.debug(
            "memory_search",
            query_length=len(query),
            results_count=len(memories),
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
        )

        return memories

    async def list_memories(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
        limit: int = 100,
    ) -> list[dict]:
        """List all memories for a user (for settings page).

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation
            limit: Maximum number of results

        Returns:
            List of all memories for the user
        """
        namespace = get_memory_namespace(org_id, team_id, user_id)

        # Use search without query to list all items
        results = await self.store.asearch(namespace, limit=limit)

        return [{"id": item.key, **item.value} for item in results]

    async def get_memory(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
        memory_id: str,
    ) -> dict | None:
        """Get a specific memory by ID.

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation
            memory_id: The memory ID to retrieve

        Returns:
            The memory dict or None if not found
        """
        namespace = get_memory_namespace(org_id, team_id, user_id)

        result = await self.store.aget(namespace, memory_id)

        if result is None:
            return None

        return {"id": result.key, **result.value}

    async def delete_memory(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
        memory_id: str,
    ) -> None:
        """Delete a specific memory.

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation
            memory_id: The memory ID to delete
        """
        namespace = get_memory_namespace(org_id, team_id, user_id)

        await self.store.adelete(namespace, memory_id)

        logger.info(
            "memory_deleted",
            memory_id=memory_id,
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
        )

    async def clear_all_memories(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
    ) -> int:
        """Clear all memories for a user.

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation

        Returns:
            Number of memories deleted
        """
        # First list all memories
        memories = await self.list_memories(org_id, team_id, user_id)

        # Delete each one
        for memory in memories:
            await self.delete_memory(org_id, team_id, user_id, memory["id"])

        logger.info(
            "memories_cleared",
            count=len(memories),
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
        )

        return len(memories)
