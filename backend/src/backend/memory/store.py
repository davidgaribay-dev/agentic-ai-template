"""LangGraph-compliant memory store using PostgresStore with semantic search.

This module implements the official LangGraph memory pattern:
- https://docs.langchain.com/oss/python/langgraph/add-memory
- https://blog.langchain.com/semantic-search-for-langgraph-memory/

The memory store uses:
- PostgresStore for persistent storage (same PostgreSQL as checkpointer)
- OpenAI embeddings for semantic search (text-embedding-3-small)
- Namespace-based multi-tenant isolation
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from langgraph.store.postgres import AsyncPostgresStore
from langchain_openai import OpenAIEmbeddings

from backend.core.config import settings
from backend.core.logging import get_logger

logger = get_logger(__name__)

# Global store instance and context manager (initialized at app startup)
_memory_store: AsyncPostgresStore | None = None
_store_context = None


async def init_memory_store() -> AsyncPostgresStore:
    """Initialize the memory store with semantic search.

    Should be called during app startup (lifespan).
    Creates necessary tables if they don't exist.

    Note: AsyncPostgresStore.from_conn_string() returns an async context manager.
    We enter the context and keep it open for the app lifetime.
    """
    global _memory_store, _store_context

    if _memory_store is not None:
        return _memory_store

    logger.info("memory_store_init", embedding_model=settings.MEMORY_EMBEDDING_MODEL)

    # Use OpenAI embeddings for semantic search
    embeddings = OpenAIEmbeddings(
        model=settings.MEMORY_EMBEDDING_MODEL,
        openai_api_key=settings.OPENAI_API_KEY,
    )

    # Create the store context manager with semantic search index
    _store_context = AsyncPostgresStore.from_conn_string(
        conn_string=settings.MEMORY_DATABASE_URI,
        index={
            "embed": embeddings,
            "dims": 1536,  # text-embedding-3-small dimensions
            "fields": ["content"],  # Index the content field for search
        },
    )

    # Enter the context manager and keep the store reference
    _memory_store = await _store_context.__aenter__()

    # Setup creates necessary tables
    await _memory_store.setup()

    logger.info("memory_store_ready")
    return _memory_store


async def get_memory_store() -> AsyncPostgresStore:
    """Get the memory store instance.

    Returns the existing instance or initializes a new one.
    Prefer calling init_memory_store() during startup.
    """
    global _memory_store

    if _memory_store is None:
        return await init_memory_store()

    return _memory_store


async def cleanup_memory_store() -> None:
    """Cleanup the memory store connection.

    Should be called during app shutdown (lifespan).
    """
    global _memory_store, _store_context

    if _store_context is not None:
        # Exit the context manager properly
        await _store_context.__aexit__(None, None, None)
        _store_context = None
        _memory_store = None
        logger.info("memory_store_cleanup")


def get_memory_namespace(org_id: str, team_id: str, user_id: str) -> tuple[str, ...]:
    """Build tenant-isolated namespace following LangGraph pattern.

    Namespace structure: ("memories", org_id, team_id, user_id)

    This ensures complete isolation:
    - Different orgs never see each other's memories
    - Different teams within an org never see each other's memories
    - Different users within a team never see each other's memories

    Args:
        org_id: Organization ID (use "default" for personal/non-org context)
        team_id: Team ID (use "default" for org-level without team)
        user_id: User ID

    Returns:
        Tuple namespace for LangGraph store operations
    """
    return ("memories", org_id, team_id, user_id)
