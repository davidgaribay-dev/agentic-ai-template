"""Utilities for safe async task management.

Provides wrappers for background tasks that ensure:
- Errors are logged rather than silently swallowed
- Tasks can be tracked and monitored
- Cleanup happens properly on cancellation

Also includes application-specific background tasks like document processing.
"""

import asyncio
from collections.abc import Awaitable, Callable, Coroutine
import contextlib
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, TypeVar
import uuid

from sqlmodel import Session

from backend.core.db import engine
from backend.core.exceptions import TimeoutError as AppTimeoutError
from backend.core.logging import get_logger
from backend.core.storage import StorageError, get_document_content
from backend.documents.chunking import DocumentChunker
from backend.documents.embeddings import EmbeddingsService
from backend.documents.models import Document, DocumentChunk
from backend.documents.parsers import DocumentParser
from backend.rag_settings.service import get_effective_rag_settings

logger = get_logger(__name__)

T = TypeVar("T")


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal attacks.

    Args:
        filename: Original filename from user upload

    Returns:
        Safe filename with path components and dangerous characters removed
    """
    # Extract just the filename, removing any path components
    safe_name = Path(filename).name

    # Remove any remaining path traversal attempts
    safe_name = safe_name.replace("..", "").replace("/", "").replace("\\", "")

    # Remove null bytes and control characters
    safe_name = re.sub(r"[\x00-\x1f\x7f]", "", safe_name)

    # Ensure we have a valid filename
    if not safe_name or safe_name.startswith("."):
        safe_name = "unnamed_file"

    return safe_name


def create_safe_task(
    coro: Coroutine[Any, Any, T],
    task_name: str,
    on_success: Callable[[T], None] | None = None,
    on_error: Callable[[Exception], None] | None = None,
) -> asyncio.Task[T | None]:
    """Create a background task with proper error handling.

    Unlike raw asyncio.create_task(), this wrapper:
    - Logs all errors with full context instead of silently failing
    - Handles CancelledError gracefully
    - Optionally calls callbacks on success/error
    - Names the task for easier debugging

    Args:
        coro: The coroutine to run
        task_name: Descriptive name for logging and debugging
        on_success: Optional callback with the result on success
        on_error: Optional callback with the exception on failure

    Returns:
        The created asyncio.Task

    Example:
        create_safe_task(
            extract_memories(conv_id, messages),
            task_name=f"memory_extraction_{conv_id}",
            on_error=lambda e: audit_log.error("extraction_failed", error=str(e))
        )
    """

    async def wrapped() -> T | None:
        try:
            result = await coro
            if on_success:
                try:
                    on_success(result)
                except Exception as callback_error:
                    logger.warning(
                        "background_task_success_callback_failed",
                        task=task_name,
                        error=str(callback_error),
                    )
            logger.debug("background_task_completed", task=task_name)
        except asyncio.CancelledError:
            logger.info("background_task_cancelled", task=task_name)
            raise
        except Exception as e:
            logger.exception(
                "background_task_failed",
                task=task_name,
                error=str(e),
                error_type=type(e).__name__,
            )
            if on_error:
                try:
                    on_error(e)
                except Exception as callback_error:
                    logger.warning(
                        "background_task_error_callback_failed",
                        task=task_name,
                        original_error=str(e),
                        callback_error=str(callback_error),
                    )
            result = None
        else:
            return result

        return result

    task = asyncio.create_task(wrapped(), name=task_name)
    logger.debug("background_task_created", task=task_name)
    return task


async def run_with_timeout(
    coro: Awaitable[T],
    timeout_seconds: float,
    operation_name: str,
) -> T:
    """Run a coroutine with a timeout.

    Args:
        coro: The coroutine to run
        timeout_seconds: Maximum time to wait
        operation_name: Name for error messages

    Returns:
        The result of the coroutine

    Raises:
        TimeoutError: If the operation times out (from core.exceptions)
    """
    try:
        result = await asyncio.wait_for(coro, timeout=timeout_seconds)
    except TimeoutError as err:
        raise AppTimeoutError(operation_name, timeout_seconds) from err
    else:
        return result


async def gather_with_errors(
    *coros: Awaitable[T],
    return_exceptions: bool = False,
) -> list[T | BaseException]:
    """Gather coroutines and handle errors consistently.

    Like asyncio.gather but with better error handling:
    - Logs all exceptions
    - Returns exceptions in results if return_exceptions=True
    - Re-raises first exception if return_exceptions=False

    Args:
        *coros: Coroutines to run concurrently
        return_exceptions: If True, return exceptions instead of raising

    Returns:
        List of results (and exceptions if return_exceptions=True)
    """
    results = await asyncio.gather(*coros, return_exceptions=True)

    exceptions = [r for r in results if isinstance(r, BaseException)]
    if exceptions:
        for exc in exceptions:
            logger.warning(
                "gather_task_failed",
                error=str(exc),
                error_type=type(exc).__name__,
            )

        if not return_exceptions:
            raise exceptions[0]

    return results


class TaskGroup:
    """Context manager for managing a group of related background tasks.

    Ensures all tasks in the group are properly cancelled and awaited
    when the context exits, preventing orphaned tasks.

    Example:
        async with TaskGroup("memory_extraction") as group:
            group.create_task(extract_memories(conv1), "conv1")
            group.create_task(extract_memories(conv2), "conv2")
        # All tasks completed or cancelled when exiting
    """

    def __init__(self, group_name: str):
        self.group_name = group_name
        self._tasks: list[asyncio.Task] = []

    async def __aenter__(self) -> "TaskGroup":
        logger.debug("task_group_started", group=self.group_name)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        # Cancel all pending tasks
        for task in self._tasks:
            if not task.done():
                task.cancel()

        # Wait for all tasks to complete (or be cancelled)
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

        completed = sum(1 for t in self._tasks if t.done() and not t.cancelled())
        cancelled = sum(1 for t in self._tasks if t.cancelled())
        logger.debug(
            "task_group_finished",
            group=self.group_name,
            total=len(self._tasks),
            completed=completed,
            cancelled=cancelled,
        )

    def create_task(
        self,
        coro: Coroutine[Any, Any, T],
        task_name: str,
    ) -> asyncio.Task[T | None]:
        """Create a task within this group."""
        full_name = f"{self.group_name}:{task_name}"
        task = create_safe_task(coro, full_name)
        self._tasks.append(task)
        return task


async def process_document_task(
    document_id: uuid.UUID,
    s3_object_key: str,
    org_id: uuid.UUID,
    team_id: uuid.UUID | None,
    user_id: uuid.UUID,
) -> dict[str, Any]:
    """Background task for document processing.

    Steps:
    1. Download file from S3/SeaweedFS
    2. Parse file using DocumentParser
    3. Chunk text based on RAG settings
    4. Generate embeddings in batches
    5. Store chunks + embeddings in DB
    6. Update document status
    7. Cleanup temp file

    Args:
        document_id: Document ID to process
        s3_object_key: S3 object key for the uploaded file
        org_id: Organization ID
        team_id: Optional team ID
        user_id: User ID who uploaded the document

    Returns:
        Processing results with status and chunk count

    Raises:
        Exception: Any processing errors (caught and logged by create_safe_task)
    """
    session = Session(engine)
    local_file_path = None

    # Get document record
    doc = session.get(Document, document_id)
    if not doc:
        raise ValueError(f"Document {document_id} not found")

    try:
        # Update status to processing
        doc.processing_status = "processing"
        doc.processing_error = None
        session.add(doc)
        session.commit()

        logger.info(
            "document_processing_started",
            document_id=str(document_id),
            filename=doc.filename,
            file_type=doc.file_type,
            s3_key=s3_object_key,
        )

        # Download file from S3 to temp location for processing
        try:
            file_content = get_document_content(s3_object_key)
            temp_dir = Path(tempfile.gettempdir()) / "rag_processing"
            temp_dir.mkdir(parents=True, exist_ok=True)
            safe_filename = sanitize_filename(doc.filename)
            # Construct path and resolve to ensure it stays within temp_dir
            target_path = (temp_dir / f"{document_id}_{safe_filename}").resolve()
            # Security check: ensure resolved path is still within temp_dir
            if not str(target_path).startswith(str(temp_dir.resolve())):
                raise ValueError("Invalid filename: path traversal attempt detected")
            local_file_path = str(target_path)
            with open(local_file_path, "wb") as f:
                f.write(file_content)
            logger.debug(
                "document_downloaded_for_processing",
                document_id=str(document_id),
                temp_path=local_file_path,
                size=len(file_content),
            )
        except StorageError as e:
            raise ValueError(f"Failed to download document from storage: {e}") from e

        # Get effective RAG settings
        rag_settings = get_effective_rag_settings(session, user_id, org_id, team_id)

        # Parse document
        logger.debug("document_parsing_started", document_id=str(document_id))
        documents = await DocumentParser.parse(
            file_path=local_file_path,
            file_type=doc.file_type,
            add_metadata=True,
        )
        logger.debug(
            "document_parsing_completed",
            document_id=str(document_id),
            page_count=len(documents),
        )

        # Chunk documents
        logger.debug("document_chunking_started", document_id=str(document_id))
        chunks = await DocumentChunker.chunk_documents(
            documents=documents,
            chunk_size=rag_settings.chunk_size,
            chunk_overlap=rag_settings.chunk_overlap,
            file_type=doc.file_type,
        )
        logger.debug(
            "document_chunking_completed",
            document_id=str(document_id),
            chunk_count=len(chunks),
        )

        # Generate embeddings in batches
        logger.debug("embeddings_generation_started", document_id=str(document_id))
        embeddings_service = EmbeddingsService()
        chunk_texts = [chunk.page_content for chunk in chunks]
        embeddings = await embeddings_service.embed_batch(
            texts=chunk_texts, batch_size=100
        )
        logger.debug(
            "embeddings_generation_completed",
            document_id=str(document_id),
            embedding_count=len(embeddings),
        )

        # Store chunks with embeddings
        logger.debug("storing_chunks_started", document_id=str(document_id))
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=False)):
            chunk_record = DocumentChunk(
                document_id=document_id,
                organization_id=org_id,
                team_id=team_id,
                user_id=user_id,
                chunk_index=idx,
                content=chunk.page_content,
                token_count=len(chunk.page_content),  # Approximate
                embedding=embedding,
                metadata_=json.dumps(chunk.metadata),
            )
            session.add(chunk_record)

        # Update document status
        doc.processing_status = "completed"
        doc.chunk_count = len(chunks)
        doc.updated_at = datetime.now(UTC)
        session.add(doc)
        session.commit()

        logger.info(
            "document_processing_completed",
            document_id=str(document_id),
            chunk_count=len(chunks),
            filename=doc.filename,
        )

        # Cleanup temp file if it exists
        if local_file_path and os.path.exists(local_file_path):
            try:
                os.remove(local_file_path)
                logger.debug("temp_file_cleaned_up", file_path=local_file_path)
            except OSError as e:
                logger.warning(
                    "temp_file_cleanup_failed", file_path=local_file_path, error=str(e)
                )

        return {"status": "success", "chunk_count": len(chunks)}

    except Exception as e:
        # Update document with error status
        if doc:
            doc.processing_status = "failed"
            doc.processing_error = str(e)
            doc.updated_at = datetime.now(UTC)
            session.add(doc)
            session.commit()

        logger.exception(
            "document_processing_failed",
            document_id=str(document_id),
            error=str(e),
            error_type=type(e).__name__,
        )

        # Cleanup temp file even on error
        if local_file_path and os.path.exists(local_file_path):
            with contextlib.suppress(OSError):
                os.remove(local_file_path)

        raise
    finally:
        session.close()
