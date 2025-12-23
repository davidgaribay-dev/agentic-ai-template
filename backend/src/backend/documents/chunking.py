"""Document chunking with context-aware strategies.

Smart chunking based on file type:
- General text: Recursive character splitting
- Code files: Language-aware splitting (preserves functions/classes)
- Structured data: Smart splitting with context preservation
"""

import asyncio

from langchain_core.documents import Document as LangChainDocument
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter


class DocumentChunker:
    """Chunk documents with context-aware strategies.

    Supports:
    - General text: Recursive character splitting
    - Code files: Language-aware splitting (preserves functions/classes)
    - Structured data: Smart splitting with context preservation
    """

    # Language mapping for code-aware chunking
    # Only includes languages supported by langchain_text_splitters.Language
    CODE_LANGUAGES: dict[str, Language] = {
        "py": Language.PYTHON,
        "js": Language.JS,
        "ts": Language.TS,
        "java": Language.JAVA,
        "cpp": Language.CPP,
        "c": Language.C,
        "go": Language.GO,
        "rs": Language.RUST,
        "rb": Language.RUBY,
        "php": Language.PHP,
        "html": Language.HTML,
        # Note: SQL, CSS not in Language enum - will use general text splitter
    }

    @classmethod
    def get_splitter(
        cls,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        file_type: str | None = None,
    ) -> RecursiveCharacterTextSplitter:
        """Get appropriate splitter based on file type.

        Args:
            chunk_size: Target chunk size in characters
            chunk_overlap: Overlap between chunks (10-20% of chunk_size)
            file_type: File extension (e.g., 'py', 'js') for code-aware splitting

        Returns:
            Configured text splitter
        """
        # Code-aware splitting for programming languages
        if file_type and file_type in cls.CODE_LANGUAGES:
            return RecursiveCharacterTextSplitter.from_language(
                language=cls.CODE_LANGUAGES[file_type],
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )

        # General text splitting (documents, JSON, YAML, etc.)
        return RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=[
                "\n\n",  # Paragraph breaks
                "\n",  # Line breaks
                ". ",  # Sentences
                ", ",  # Clauses
                " ",  # Words
                "",  # Characters
            ],
            length_function=len,
            is_separator_regex=False,
        )

    @classmethod
    async def chunk_documents(
        cls,
        documents: list[LangChainDocument],
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        file_type: str | None = None,
    ) -> list[LangChainDocument]:
        """Chunk documents with metadata preservation.

        Args:
            documents: List of LangChain documents to chunk
            chunk_size: Target size per chunk
            chunk_overlap: Overlap between chunks
            file_type: Optional file type for smart chunking

        Returns:
            List of chunked documents with preserved + enhanced metadata
        """
        # Get appropriate splitter
        splitter = cls.get_splitter(chunk_size, chunk_overlap, file_type)

        # Chunk (run in thread pool to avoid blocking)
        chunked_docs = await asyncio.to_thread(
            splitter.split_documents,
            documents,
        )

        # Enhance metadata with chunk info
        for idx, chunk in enumerate(chunked_docs):
            chunk.metadata["chunk_index"] = idx
            chunk.metadata["total_chunks"] = len(chunked_docs)
            chunk.metadata["chunk_size"] = len(chunk.page_content)

        return chunked_docs
