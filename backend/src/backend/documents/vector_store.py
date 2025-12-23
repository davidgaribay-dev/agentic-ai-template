"""Vector store service for multi-tenant semantic similarity search.

Uses pgvector HNSW index for fast, accurate vector search with tenant isolation.
"""

import uuid
from typing import Any

from sqlalchemy import text
from sqlmodel import Session

from backend.documents.embeddings import EmbeddingsService


class SearchResult:
    """Search result with chunk data and similarity score."""

    def __init__(self, row: Any) -> None:
        """Initialize from database row."""
        self.id: uuid.UUID = row.id
        self.document_id: uuid.UUID = row.document_id
        self.content: str = row.content
        self.metadata_: dict[str, Any] | None = row.metadata_
        self.filename: str = row.filename
        self.file_type: str = row.file_type
        self.similarity: float = row.similarity
        self.chunk_index: int = row.chunk_index


class VectorStoreService:
    """Multi-tenant vector similarity search with pgvector."""

    def __init__(self, session: Session) -> None:
        """Initialize vector store service.

        Args:
            session: SQLModel database session
        """
        self.session = session
        self.embeddings = EmbeddingsService()

    async def similarity_search(
        self,
        query: str,
        org_id: uuid.UUID,
        team_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        k: int = 4,
        score_threshold: float = 0.7,
    ) -> list[SearchResult]:
        """Multi-tenant semantic similarity search.

        Args:
            query: Search query text
            org_id: Organization ID (required)
            team_id: Optional team ID (includes org-level + team-level docs)
            user_id: Optional user ID (includes all accessible docs)
            k: Number of results
            score_threshold: Minimum similarity score (0-1)

        Returns:
            List of SearchResult objects with chunk data and scores
        """
        # Generate query embedding
        query_embedding = await self.embeddings.embed_query(query)

        # Build SQL query with tenant filtering
        # Distance operator <=> returns cosine distance (1 - cosine similarity)
        # So we compute similarity as: 1 - (embedding <=> query_embedding)
        # Note: We format the embedding directly into the SQL to avoid SQLAlchemy
        # parameter binding issues with the ::vector cast and <=> operator
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        # Build WHERE clause conditions based on provided filters
        # We avoid mixing SQLAlchemy parameters with PostgreSQL ::type cast
        # by handling NULL checks in Python instead
        team_filter = (
            "AND (de.team_id IS NULL OR de.team_id = :team_id)"
            if team_id is not None
            else ""
        )
        user_filter = "AND de.user_id = :user_id" if user_id is not None else ""

        sql = text(f"""
            SELECT
                de.id,
                de.document_id,
                de.content,
                de.metadata_,
                de.chunk_index,
                d.filename,
                d.file_type,
                1 - (de.embedding <=> '{embedding_str}'::vector) as similarity
            FROM document_chunks de
            JOIN documents d ON de.document_id = d.id
            WHERE
                de.organization_id = :org_id
                {team_filter}
                {user_filter}
                AND d.processing_status = 'completed'
                AND d.deleted_at IS NULL
            ORDER BY de.embedding <=> '{embedding_str}'::vector
            LIMIT :k
        """)

        # Build parameters dict - only include params that are in the query
        params: dict[str, str | int] = {
            "org_id": str(org_id),
            "k": k,
        }
        if team_id is not None:
            params["team_id"] = str(team_id)
        if user_id is not None:
            params["user_id"] = str(user_id)

        result = self.session.execute(sql, params)

        rows = result.fetchall()

        # Filter by score threshold and convert to SearchResult objects
        filtered = [
            SearchResult(row) for row in rows if row.similarity >= score_threshold
        ]

        return filtered

    async def hybrid_search(
        self,
        query: str,
        org_id: uuid.UUID,
        team_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        k: int = 4,
        score_threshold: float = 0.7,
        semantic_weight: float = 0.7,
    ) -> list[SearchResult]:
        """Hybrid search combining semantic (vector) + keyword (trigram) search.

        Note: Requires pg_trgm extension and trigram index on content column.
        This is an advanced feature for future enhancement.

        Args:
            query: Search query text
            org_id: Organization ID
            team_id: Optional team ID
            user_id: Optional user ID
            k: Number of results
            score_threshold: Minimum similarity score
            semantic_weight: Weight for semantic vs keyword (0.7 = 70% semantic, 30% keyword)

        Returns:
            List of SearchResult objects with combined scores
        """
        # For now, fall back to semantic search only
        # TODO: Implement RRF (Reciprocal Rank Fusion) combining vector + trigram
        return await self.similarity_search(
            query=query,
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            k=k,
            score_threshold=score_threshold,
        )
