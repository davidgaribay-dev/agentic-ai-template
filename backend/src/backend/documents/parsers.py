"""Document parsers for RAG system.

Comprehensive file type support using LangChain loaders:
- Documents: PDF, TXT, MD, DOCX, RTF
- Structured: JSON, YAML, CSV, XLSX, XML
- Code: PY, JS, TS, JAVA, CPP, GO, RS, etc.
- Web: HTML, CSS
"""

import asyncio
from pathlib import Path
from typing import Any, ClassVar

from langchain_community.document_loaders import (
    CSVLoader,
    Docx2txtLoader,
    # Structured data
    JSONLoader,
    # Documents
    PyPDFLoader,
    TextLoader,
    UnstructuredExcelLoader,
    # Web
    UnstructuredHTMLLoader,
    UnstructuredMarkdownLoader,
    UnstructuredRTFLoader,
    UnstructuredXMLLoader,
)
from langchain_core.documents import Document as LangChainDocument


class DocumentParser:
    """Parse various document formats with comprehensive file type support.

    Supports:
    - Documents: PDF, TXT, MD, DOCX, RTF
    - Structured: JSON, YAML, CSV, XLSX, XML
    - Code: PY, JS, TS, JAVA, CPP, GO, RS, etc.
    - Web: HTML, CSS
    """

    # File type to loader mapping
    LOADERS: ClassVar[dict[str, type]] = {
        # === DOCUMENTS ===
        "pdf": PyPDFLoader,
        "txt": TextLoader,
        "md": UnstructuredMarkdownLoader,
        "docx": Docx2txtLoader,
        "rtf": UnstructuredRTFLoader,
        # === STRUCTURED DATA ===
        "json": JSONLoader,
        "yaml": TextLoader,  # Parse as text, structure preserved
        "yml": TextLoader,
        "xml": UnstructuredXMLLoader,
        "csv": CSVLoader,
        "xlsx": UnstructuredExcelLoader,
        # === CODE FILES (all as TextLoader with metadata) ===
        "py": TextLoader,
        "js": TextLoader,
        "ts": TextLoader,
        "jsx": TextLoader,
        "tsx": TextLoader,
        "java": TextLoader,
        "cpp": TextLoader,
        "c": TextLoader,
        "h": TextLoader,
        "go": TextLoader,
        "rs": TextLoader,
        "rb": TextLoader,
        "php": TextLoader,
        "sh": TextLoader,
        "sql": TextLoader,
        # === WEB ===
        "html": UnstructuredHTMLLoader,
        "htm": UnstructuredHTMLLoader,
        "css": TextLoader,
    }

    # MIME type mapping (for validation)
    MIME_TYPES: ClassVar[dict[str, str]] = {
        "pdf": "application/pdf",
        "txt": "text/plain",
        "md": "text/markdown",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "rtf": "application/rtf",
        "json": "application/json",
        "yaml": "application/x-yaml",
        "yml": "application/x-yaml",
        "xml": "application/xml",
        "csv": "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "html": "text/html",
        "htm": "text/html",
        "css": "text/css",
    }

    @classmethod
    async def parse(
        cls,
        file_path: str,
        file_type: str,
        add_metadata: bool = True,
    ) -> list[LangChainDocument]:
        """Parse document and return LangChain Document objects.

        Args:
            file_path: Path to file on disk
            file_type: File extension (without dot)
            add_metadata: Whether to enhance metadata with file info

        Returns:
            List of LangChain Document objects with page_content and metadata

        Raises:
            ValueError: If file type is not supported
        """
        # Get loader class
        loader_class = cls.LOADERS.get(file_type.lower())
        if not loader_class:
            raise ValueError(
                f"Unsupported file type: {file_type}. "
                f"Supported: {', '.join(cls.LOADERS.keys())}"
            )

        # Special handling for different loader types
        loader_kwargs: dict[str, Any] = {}

        if file_type == "json":
            # JSONLoader requires jq_schema parameter
            loader_kwargs = {
                "jq_schema": ".",  # Load entire JSON
                "text_content": False,
            }
        elif file_type == "csv":
            # CSVLoader creates one document per row
            loader_kwargs = {
                "csv_args": {"delimiter": ",", "quotechar": '"'},
            }

        # Create loader
        loader = loader_class(file_path, **loader_kwargs)

        # Load documents (run in thread to not block)
        documents = await asyncio.to_thread(loader.load)

        # Enhance metadata
        if add_metadata:
            file_path_obj = Path(file_path)
            for doc in documents:
                doc.metadata.update(
                    {
                        "file_type": file_type,
                        "filename": file_path_obj.name,
                        "mime_type": cls.MIME_TYPES.get(file_type),
                    }
                )

                # Add language hint for code files
                if cls._is_code_file(file_type):
                    doc.metadata["language"] = cls._get_language_name(file_type)

        return documents

    @staticmethod
    def _is_code_file(file_type: str) -> bool:
        """Check if file type is a code file."""
        code_extensions = {
            "py",
            "js",
            "ts",
            "jsx",
            "tsx",
            "java",
            "cpp",
            "c",
            "h",
            "go",
            "rs",
            "rb",
            "php",
            "sh",
            "sql",
        }
        return file_type in code_extensions

    @staticmethod
    def _get_language_name(file_type: str) -> str:
        """Get programming language name from extension."""
        language_map = {
            "py": "Python",
            "js": "JavaScript",
            "ts": "TypeScript",
            "jsx": "React JSX",
            "tsx": "React TSX",
            "java": "Java",
            "cpp": "C++",
            "c": "C",
            "h": "C/C++ Header",
            "go": "Go",
            "rs": "Rust",
            "rb": "Ruby",
            "php": "PHP",
            "sh": "Shell",
            "sql": "SQL",
        }
        return language_map.get(file_type, file_type.upper())

    @classmethod
    def get_supported_extensions(cls) -> list[str]:
        """Get list of all supported file extensions."""
        return list(cls.LOADERS.keys())

    @classmethod
    def is_supported(cls, file_type: str) -> bool:
        """Check if file type is supported."""
        return file_type.lower() in cls.LOADERS
