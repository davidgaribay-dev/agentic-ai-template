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

    # Similarity threshold for deduplication (0.0-1.0, higher = more similar required)
    # Lowered to 0.75 to catch more semantic duplicates like variations of the same fact
    DEDUP_SIMILARITY_THRESHOLD = 0.75

    # Minimum word overlap ratio to consider as duplicate (0.0-1.0)
    # If >60% of significant words overlap, likely duplicate even with lower embedding score
    WORD_OVERLAP_THRESHOLD = 0.6

    def __init__(self, store: BaseStore):
        self.store = store

    def _extract_significant_words(self, text: str) -> set[str]:
        """Extract significant words for overlap comparison.

        Filters out common stop words and keeps meaningful content words.
        """
        stop_words = {
            "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "could",
            "should", "may", "might", "must", "shall", "can", "need", "to", "of",
            "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
            "during", "before", "after", "above", "below", "between", "under",
            "again", "further", "then", "once", "here", "there", "when", "where",
            "why", "how", "all", "each", "few", "more", "most", "other", "some",
            "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
            "very", "just", "and", "but", "if", "or", "because", "until", "while",
            "about", "against", "this", "that", "these", "those", "am", "it", "its",
            "user", "prefers", "likes", "wants", "needs", "interested",
        }
        words = set(text.lower().split())
        # Keep words that are not stop words and have 3+ characters
        return {w.strip(".,!?;:'\"()[]{}") for w in words if w not in stop_words and len(w) >= 3}

    def _calculate_word_overlap(self, text1: str, text2: str) -> float:
        """Calculate word overlap ratio between two texts."""
        words1 = self._extract_significant_words(text1)
        words2 = self._extract_significant_words(text2)

        if not words1 or not words2:
            return 0.0

        intersection = words1 & words2
        # Use the smaller set as denominator to catch when one is subset of other
        smaller_set_size = min(len(words1), len(words2))
        return len(intersection) / smaller_set_size if smaller_set_size > 0 else 0.0

    async def _find_duplicate(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
        content: str,
        memory_type: str,
    ) -> dict | None:
        """Check if a semantically similar memory already exists.

        Uses embedding-based search combined with word overlap to find near-duplicates.

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation
            content: The memory content to check
            memory_type: Type of memory (must match for deduplication)

        Returns:
            The existing memory dict if a duplicate is found, None otherwise
        """
        namespace = get_memory_namespace(org_id, team_id, user_id)

        # Search for similar memories using the content as query
        results = await self.store.asearch(
            namespace,
            query=content,
            limit=10,  # Check more candidates for better dedup
        )

        for item in results:
            # Check if this is a potential duplicate
            existing_type = item.value.get("type", "")
            existing_content = item.value.get("content", "")

            # Must be same type
            if existing_type != memory_type:
                continue

            # Check similarity score if available
            similarity_score = None
            if hasattr(item, "score") and item.score is not None:
                similarity_score = item.score
                if similarity_score >= self.DEDUP_SIMILARITY_THRESHOLD:
                    logger.debug(
                        "duplicate_memory_found_by_embedding",
                        existing_id=item.key,
                        similarity_score=similarity_score,
                        existing_content=existing_content[:100],
                        new_content=content[:100],
                    )
                    return {"id": item.key, **item.value}

            # Check word overlap - catches variations of same fact
            word_overlap = self._calculate_word_overlap(content, existing_content)
            if word_overlap >= self.WORD_OVERLAP_THRESHOLD:
                logger.debug(
                    "duplicate_memory_found_by_word_overlap",
                    existing_id=item.key,
                    word_overlap=word_overlap,
                    similarity_score=similarity_score,
                    existing_content=existing_content[:100],
                    new_content=content[:100],
                )
                return {"id": item.key, **item.value}

            # Fallback: exact content match (for stores without score)
            if existing_content.strip().lower() == content.strip().lower():
                logger.debug(
                    "exact_duplicate_memory_found",
                    existing_id=item.key,
                    content=content[:100],
                )
                return {"id": item.key, **item.value}

        return None

    async def store_memory(
        self,
        org_id: str,
        team_id: str,
        user_id: str,
        content: str,
        memory_type: str,
        metadata: dict | None = None,
    ) -> str | None:
        """Store a memory using LangGraph's put() pattern.

        Performs deduplication check before storing to avoid duplicates.

        Args:
            org_id: Organization ID for isolation
            team_id: Team ID for isolation
            user_id: User ID for isolation
            content: The memory content (will be embedded for search)
            memory_type: Type of memory (preference, fact, entity, relationship, summary)
            metadata: Optional additional metadata

        Returns:
            The generated memory ID, or None if a duplicate was found
        """
        # Check for duplicates before storing
        existing = await self._find_duplicate(
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            content=content,
            memory_type=memory_type,
        )

        if existing:
            logger.info(
                "memory_duplicate_skipped",
                existing_id=existing["id"],
                memory_type=memory_type,
                org_id=org_id,
                team_id=team_id,
                user_id=user_id,
            )
            return None

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
