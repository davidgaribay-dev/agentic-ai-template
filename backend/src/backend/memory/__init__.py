"""LangGraph memory module for persistent cross-conversation memory.

This module provides:
- PostgresStore with semantic search for long-term memory
- Namespace-based multi-tenant isolation (org/team/user)
- Memory extraction using LangMem patterns
- CRUD operations for memory management

Memory is separate from conversation history (checkpointer):
- Checkpointer: Short-term conversation state within a thread
- Memory Store: Long-term facts, preferences, entities across conversations
"""

from backend.memory.store import (
    get_memory_store,
    get_memory_namespace,
    init_memory_store,
    cleanup_memory_store,
)
from backend.memory.service import MemoryService

__all__ = [
    "get_memory_store",
    "get_memory_namespace",
    "init_memory_store",
    "cleanup_memory_store",
    "MemoryService",
]
