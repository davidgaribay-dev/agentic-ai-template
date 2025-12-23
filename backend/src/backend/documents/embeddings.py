"""Embeddings service for document vectorization.

Uses OpenAI text-embedding-3-small (1536 dimensions) for efficient, high-quality embeddings.
"""

from langchain_openai import OpenAIEmbeddings

from backend.core.config import settings


class EmbeddingsService:
    """Generate embeddings for documents using OpenAI."""

    def __init__(self) -> None:
        """Initialize embeddings service with OpenAI."""
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",  # 1536 dimensions
            openai_api_key=settings.OPENAI_API_KEY,
        )

    async def embed_query(self, text: str) -> list[float]:
        """Generate embedding for a single query.

        Args:
            text: Query text to embed

        Returns:
            Embedding vector (1536 dimensions)
        """
        return await self.embeddings.aembed_query(text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple documents.

        Args:
            texts: List of document texts to embed

        Returns:
            List of embedding vectors (1536 dimensions each)
        """
        return await self.embeddings.aembed_documents(texts)

    async def embed_batch(
        self,
        texts: list[str],
        batch_size: int = 100,
    ) -> list[list[float]]:
        """Generate embeddings in batches for efficiency.

        Args:
            texts: List of texts to embed
            batch_size: Number of texts per batch (default: 100)

        Returns:
            List of embedding vectors
        """
        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            embeddings = await self.embeddings.aembed_documents(batch)
            all_embeddings.extend(embeddings)

        return all_embeddings
