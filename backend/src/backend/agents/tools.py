import ast
from datetime import UTC, datetime
import json
import operator
from typing import Any
import uuid

from langchain_core.tools import StructuredTool, tool
from pydantic import BaseModel, Field
from sqlmodel import Session

from backend.core.db import engine
from backend.core.logging import get_logger
from backend.documents.service import DocumentService
from backend.rag_settings.service import get_effective_rag_settings

logger = get_logger(__name__)

_SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval_node(node: ast.AST) -> float | int:
    """Safely evaluate an AST node containing a mathematical expression."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value)}")
    if isinstance(node, ast.BinOp):
        op_func = _SAFE_OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        left = _safe_eval_node(node.left)
        right = _safe_eval_node(node.right)
        result: float | int = op_func(left, right)
        return result
    if isinstance(node, ast.UnaryOp):
        op_func = _SAFE_OPERATORS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        unary_result: float | int = op_func(_safe_eval_node(node.operand))
        return unary_result
    if isinstance(node, ast.Expression):
        return _safe_eval_node(node.body)
    raise ValueError(f"Unsupported expression type: {type(node).__name__}")


@tool
def get_current_time() -> str:
    """Get the current date and time in ISO format."""
    return datetime.now(UTC).isoformat()


@tool
def calculate(expression: str) -> str:
    """Safely evaluate a mathematical expression and return the result."""
    try:
        tree = ast.parse(expression, mode="eval")
        result = _safe_eval_node(tree)
        return str(result)
    except (SyntaxError, ValueError) as e:
        return f"Error: {e}"
    except ZeroDivisionError:
        return "Error: Division by zero"
    except Exception as e:
        return f"Error: Could not evaluate expression - {e}"


class SearchDocumentsInput(BaseModel):
    """Input schema for the search_documents tool."""

    query: str = Field(description="What to search for in the documents")
    limit: int = Field(
        default=4,
        ge=1,
        le=20,
        description="Maximum number of results to return (default: 4, max: 20)",
    )


async def _search_documents_impl(
    query: str,
    limit: int = 4,
    *,
    org_id: str,
    team_id: str | None,
    user_id: str,
) -> str:
    """Implementation of document search with pre-bound context.

    Args:
        query: What to search for in the documents
        limit: Maximum number of results to return
        org_id: Organization ID (pre-bound)
        team_id: Team ID (pre-bound)
        user_id: User ID (pre-bound)

    Returns:
        JSON string containing relevant document chunks with metadata
    """
    logger.info(
        "search_documents_called",
        query=query[:100],  # Truncate for logging
        limit=limit,
        org_id=org_id,
        team_id=team_id,
        user_id=user_id,
    )

    # Parse UUIDs
    try:
        org_uuid = uuid.UUID(org_id)
        user_uuid = uuid.UUID(user_id)
        team_uuid = uuid.UUID(team_id) if team_id else None
    except ValueError as e:
        logger.exception("search_documents_invalid_uuid", error=str(e))
        return json.dumps({"error": f"Invalid UUID: {e}"}, indent=2)

    # Get database session
    with Session(engine) as session:
        try:
            # Check if RAG is enabled
            rag_settings = get_effective_rag_settings(
                session, user_uuid, org_uuid, team_uuid
            )

            if not rag_settings.rag_enabled:
                logger.info("search_documents_rag_disabled", org_id=org_id)
                return json.dumps(
                    {"error": "Document search is disabled for your organization"},
                    indent=2,
                )

            # Enforce limit
            k = min(limit, 20)

            # Perform search
            doc_service = DocumentService(session)
            results = await doc_service.search_documents(
                query=query,
                org_id=org_uuid,
                team_id=team_uuid,
                user_id=user_uuid,
                k=k,
                score_threshold=rag_settings.similarity_threshold,
            )

            logger.info(
                "search_documents_completed",
                query=query[:50],
                result_count=len(results) if results else 0,
            )

            if not results:
                return json.dumps(
                    {"message": "No relevant documents found", "results": []},
                    indent=2,
                )

            # Build citation instruction for the LLM
            citation_instruction = (
                "\n\nIMPORTANT: When using information from these sources in your response, "
                "cite them inline using the format [[source_name]] at the end of the relevant "
                "sentence or paragraph. For example: 'The project deadline is March 15th [[project-notes.md]].' "
                "Use the source filename (without path) as the citation marker. "
                "Multiple citations can be added: 'This is documented [[doc1.md]] [[doc2.pdf]]'"
            )

            return json.dumps(
                {
                    "message": f"Found {len(results)} relevant chunks"
                    + citation_instruction,
                    "results": results,
                },
                indent=2,
            )

        except Exception as e:
            logger.exception("search_documents_failed", error=str(e))
            return json.dumps({"error": f"Search failed: {e!s}"}, indent=2)


def create_search_documents_tool(
    org_id: str,
    team_id: str | None,
    user_id: str,
) -> StructuredTool:
    """Create a search_documents tool with pre-bound context.

    This creates a tool instance where the org_id, team_id, and user_id
    are already bound, so the LLM only needs to provide query and limit.

    Args:
        org_id: Organization ID to bind
        team_id: Team ID to bind (can be None)
        user_id: User ID to bind

    Returns:
        A StructuredTool with context pre-bound
    """

    async def search_with_context(query: str, limit: int = 4) -> str:
        return await _search_documents_impl(
            query=query,
            limit=limit,
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
        )

    return StructuredTool.from_function(
        coroutine=search_with_context,
        name="search_documents",
        description=(
            "Search the user's uploaded documents for relevant information. "
            "ALWAYS use this tool FIRST when the user asks about: "
            "- Their personal files, notes, or documentation they uploaded "
            "- Todo lists, tasks, or action items from their documents "
            "- Meeting notes, project requirements, or internal knowledge "
            "- Any question that might be answered by their uploaded files. "
            "This searches documents uploaded via the RAG/document upload feature, "
            "NOT external systems like GitHub. "
            "Examples: 'What are my todos?', 'Find my meeting notes', 'Search my documents for...'"
        ),
        args_schema=SearchDocumentsInput,
    )


def get_available_tools() -> list[Any]:
    """Get list of available built-in tools for the agent.

    Note: This returns tools that don't require context binding.
    For context-aware tools like search_documents, use get_context_aware_tools().
    """
    return [
        get_current_time,
        calculate,
    ]


def get_context_aware_tools(
    org_id: str | None,
    team_id: str | None,
    user_id: str | None,
) -> list[Any]:
    """Get tools that require user context to function.

    These tools have org_id, team_id, and user_id pre-bound so the LLM
    doesn't need to know or provide these values.

    Args:
        org_id: Organization ID
        team_id: Team ID (can be None)
        user_id: User ID

    Returns:
        List of context-aware tools
    """
    tools: list[Any] = []

    logger.info(
        "get_context_aware_tools_called",
        org_id=org_id,
        team_id=team_id,
        user_id=user_id,
    )

    # Only add search_documents if we have the required context
    if org_id and user_id:
        search_tool = create_search_documents_tool(
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
        )
        tools.append(search_tool)
        logger.info(
            "search_documents_tool_created",
            tool_name=search_tool.name,
        )

    return tools
