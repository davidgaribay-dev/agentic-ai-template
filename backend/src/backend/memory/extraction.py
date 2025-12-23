"""Memory extraction following LangMem patterns.

This module extracts memories from conversations using an LLM.
Follows the patterns from https://langchain-ai.github.io/langmem/

Memory types extracted:
- Preferences: User preferences for communication, tools, languages
- Facts: Information about user, project, company
- Entities: Named entities (people, projects, technologies)
- Relationships: Connections between entities (stored as JSON in content)
- Summaries: High-level conversation themes
"""

import json
import uuid

from backend.agents.llm import get_chat_model, get_chat_model_with_context
from backend.audit import audit_service
from backend.audit.schemas import LogLevel, Target
from backend.core.logging import get_logger
from backend.memory.service import MemoryService
from backend.memory.store import get_memory_store

logger = get_logger(__name__)

# Minimum number of parts expected after splitting markdown code blocks
MIN_EXTRACTION_MESSAGES = 2


async def extract_and_store_memories(
    user_message: str,
    assistant_response: str,
    org_id: str,
    team_id: str,
    user_id: str,
    conversation_id: str | None = None,
) -> int:
    """Extract memories from a conversation and store them.

    Uses LLM to analyze the conversation and extract memorable information,
    then stores each memory in the memory store.

    Args:
        user_message: The user's message
        assistant_response: The assistant's response
        org_id: Organization ID for isolation
        team_id: Team ID for isolation
        user_id: User ID for isolation
        conversation_id: Optional conversation ID for metadata

    Returns:
        Number of memories stored
    """
    try:
        # Get the appropriate LLM
        logger.info(
            "memory_extraction_starting",
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            conversation_id=conversation_id,
        )

        if org_id and org_id != "default":
            try:
                llm = get_chat_model_with_context(
                    org_id, team_id if team_id != "default" else None
                )
            except Exception as e:
                logger.exception(
                    "memory_extraction_llm_init_error",
                    error=str(e),
                    error_type=type(e).__name__,
                    org_id=org_id,
                    team_id=team_id,
                )
                raise
        else:
            llm = get_chat_model()

        logger.info("memory_extraction_llm_ready", llm_type=type(llm).__name__)

        # Format the prompt using string concatenation to avoid issues with
        # curly braces in user/assistant messages being interpreted as format specifiers
        prompt = f"""Analyze this conversation and extract NEW information worth remembering long-term.

Focus on:
1. User preferences (communication style, technical preferences, tools, languages)
2. Facts about the user, their project, or company
3. Named entities (people, projects, technologies, companies)
4. Relationships between entities (e.g., "Project X uses Python", "User works at Company Y")
5. Key topics or themes that might be relevant in future conversations

Return a JSON object with extracted memories. Only include genuinely useful information.
Skip small talk, greetings, and trivial exchanges.

Response format:
{{"memories": [{{"content": "descriptive text about the memory", "type": "preference|fact|entity|relationship|summary"}}]}}

If nothing worth remembering, return: {{"memories": []}}

Important:
- Content should be self-contained and understandable without context
- Be specific and concrete, not vague
- Prefer facts over opinions
- Only extract things explicitly stated or strongly implied
- Do NOT extract generic or commonly repeated information
- Each memory should capture a distinct, specific piece of information
- Avoid extracting the same information in different phrasings

Conversation:
User: {user_message[:2000]}
Assistant: {assistant_response[:2000]}

JSON response:"""

        # Call LLM for extraction
        logger.info("memory_extraction_calling_llm")
        try:
            response = await llm.ainvoke(prompt)
            content = str(response.content).strip()
            logger.info(
                "memory_extraction_llm_response",
                response_length=len(content),
                raw_content=content[:500],
            )
        except Exception as e:
            logger.exception(
                "memory_extraction_llm_invoke_error",
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

        # Parse JSON response
        # Handle potential markdown code blocks
        if content.startswith("```"):
            # Split and get the content between first ``` and second ```
            parts = content.split("```")
            if len(parts) >= MIN_EXTRACTION_MESSAGES:
                content = parts[1]
                # Strip language identifier (json, JSON, etc.)
                if content.lower().startswith("json"):
                    content = content[4:]
                elif content.startswith("\n"):
                    pass  # No language identifier, just newline
            logger.debug(
                "memory_extraction_after_markdown_strip", content_preview=content[:200]
            )
        content = content.strip()

        logger.debug("memory_extraction_parsing_json", content_preview=content[:200])
        extracted = json.loads(content)
        memories = extracted.get("memories", [])

        if not memories:
            logger.debug(
                "no_memories_extracted",
                org_id=org_id,
                team_id=team_id,
                user_id=user_id,
            )
            return 0

        # Store memories
        store = await get_memory_store()
        service = MemoryService(store)
        stored_count = 0

        for memory in memories:
            if not memory.get("content") or not memory.get("type"):
                continue

            # store_memory returns None if a duplicate was found and skipped
            memory_id = await service.store_memory(
                org_id=org_id,
                team_id=team_id,
                user_id=user_id,
                content=memory["content"],
                memory_type=memory["type"],
                metadata={
                    "conversation_id": conversation_id,
                    "source": "extraction",
                },
            )
            if memory_id is not None:
                stored_count += 1

        # Audit log the extraction
        if stored_count > 0:
            await audit_service.log(
                "memory.extracted",
                targets=[Target(type="memory", id=conversation_id or "unknown")],
                organization_id=uuid.UUID(org_id)
                if org_id and org_id != "default"
                else None,
                team_id=uuid.UUID(team_id)
                if team_id and team_id != "default"
                else None,
                severity=LogLevel.INFO,
                metadata={
                    "stored_count": stored_count,
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                },
            )

        logger.info(
            "memories_extracted",
            stored_count=stored_count,
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            conversation_id=conversation_id,
        )

    except json.JSONDecodeError as e:
        logger.warning(
            "memory_extraction_parse_error",
            error=str(e),
            org_id=org_id,
            user_id=user_id,
        )
        return 0

    except Exception as e:
        logger.exception(
            "memory_extraction_error",
            error=str(e),
            error_type=type(e).__name__,
            org_id=org_id,
            user_id=user_id,
        )
        stored_count = 0

    return stored_count


def format_memories_for_context(memories: list[dict]) -> str:
    """Format retrieved memories for injection into system prompt.

    Args:
        memories: List of memory dicts from search

    Returns:
        Formatted string for system prompt injection
    """
    if not memories:
        return ""

    lines = ["What I remember about you:"]

    # Group by type for cleaner formatting
    by_type: dict[str, list[str]] = {}
    for memory in memories:
        memory_type = memory.get("type", "fact")
        content = memory.get("content", "")
        if content:
            if memory_type not in by_type:
                by_type[memory_type] = []
            by_type[memory_type].append(content)

    # Format each type
    type_labels = {
        "preference": "Preferences",
        "fact": "Facts",
        "entity": "Known entities",
        "relationship": "Relationships",
        "summary": "Context",
    }

    for memory_type, items in by_type.items():
        label = type_labels.get(memory_type, memory_type.title())
        lines.append(f"\n{label}:")
        for item in items:
            lines.append(f"  - {item}")

    return "\n".join(lines)
