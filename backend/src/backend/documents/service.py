"""Document management and processing service.

Orchestrates document upload, processing, chunking, embedding, and retrieval.
"""

from datetime import UTC, datetime
import json
import uuid

from sqlmodel import Session, select

from backend.core.logging import get_logger
from backend.core.storage import delete_document as s3_delete_document
from backend.documents.chunking import DocumentChunker
from backend.documents.embeddings import EmbeddingsService
from backend.documents.models import Document, DocumentChunk
from backend.documents.parsers import DocumentParser
from backend.documents.vector_store import VectorStoreService
from backend.rag_settings.service import get_effective_rag_settings


class DocumentService:
    """Document management and processing orchestration."""

    def __init__(self, session: Session) -> None:
        """Initialize document service.

        Args:
            session: SQLModel database session
        """
        self.session = session
        self.embeddings = EmbeddingsService()
        self.vector_store = VectorStoreService(session)

    async def create_document(
        self,
        filename: str,
        file_path: str,
        file_size: int,
        file_type: str,
        mime_type: str | None,
        org_id: uuid.UUID,
        team_id: uuid.UUID | None,
        user_id: uuid.UUID,
        created_by_id: uuid.UUID,
    ) -> Document:
        """Create document record (status=pending).

        Note: This creates the database record. Background processing should be
        triggered separately via a task queue.

        Args:
            filename: Original filename
            file_path: S3/storage path
            file_size: File size in bytes
            file_type: File extension
            mime_type: MIME type
            org_id: Organization ID
            team_id: Optional team ID
            user_id: Optional user ID
            created_by_id: User who uploaded the document

        Returns:
            Created Document record
        """
        doc = Document(
            organization_id=org_id,
            team_id=team_id,
            user_id=user_id,
            created_by_id=created_by_id,
            filename=filename,
            file_path=file_path,
            file_size=file_size,
            file_type=file_type,
            mime_type=mime_type,
            processing_status="pending",
        )
        self.session.add(doc)
        self.session.commit()
        self.session.refresh(doc)

        return doc

    async def process_document(
        self,
        document_id: uuid.UUID,
        local_file_path: str,
        org_id: uuid.UUID,
        team_id: uuid.UUID | None,
        user_id: uuid.UUID,
    ) -> None:
        """Process document: parse, chunk, embed, and store.

        This should be called from a background task after downloading the file
        from storage to a temporary local path.

        Args:
            document_id: Document ID to process
            local_file_path: Path to downloaded file on disk
            org_id: Organization ID
            team_id: Optional team ID
            user_id: User ID

        Raises:
            ValueError: If document not found or already processed
        """
        # Get document
        doc = self.session.get(Document, document_id)
        if not doc:
            raise ValueError(f"Document not found: {document_id}")

        if doc.processing_status == "completed":
            raise ValueError(f"Document already processed: {document_id}")

        try:
            # Update status to processing
            doc.processing_status = "processing"
            self.session.add(doc)
            self.session.commit()

            # Get effective RAG settings
            rag_settings = get_effective_rag_settings(
                self.session, user_id, org_id, team_id
            )

            # Parse document
            documents = await DocumentParser.parse(
                local_file_path,
                doc.file_type,
                add_metadata=True,
            )

            # Chunk documents
            chunks = await DocumentChunker.chunk_documents(
                documents,
                chunk_size=rag_settings.chunk_size,
                chunk_overlap=rag_settings.chunk_overlap,
                file_type=doc.file_type,
            )

            # Generate embeddings (batch for efficiency)
            chunk_texts = [chunk.page_content for chunk in chunks]
            embeddings = await self.embeddings.embed_batch(
                chunk_texts,
                batch_size=100,
            )

            # Store chunks with embeddings
            for idx, (chunk, embedding) in enumerate(
                zip(chunks, embeddings, strict=False)
            ):
                chunk_record = DocumentChunk(
                    document_id=doc.id,
                    organization_id=doc.organization_id,
                    team_id=doc.team_id,
                    user_id=doc.user_id,
                    chunk_index=idx,
                    content=chunk.page_content,
                    embedding=embedding,
                    metadata_=json.dumps(chunk.metadata),  # Store as JSON string
                    token_count=len(chunk.page_content.split()),  # Rough estimate
                )
                self.session.add(chunk_record)

            # Update document status
            doc.processing_status = "completed"
            doc.chunk_count = len(chunks)
            doc.updated_at = datetime.now(UTC)
            self.session.add(doc)
            self.session.commit()

        except Exception as e:
            # Update document with error
            doc.processing_status = "failed"
            doc.processing_error = str(e)
            doc.updated_at = datetime.now(UTC)
            self.session.add(doc)
            self.session.commit()
            raise

    def list_documents(
        self,
        org_id: uuid.UUID,
        team_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        status: str | None = None,
        include_deleted: bool = False,
    ) -> list[Document]:
        """List documents with filters.

        Args:
            org_id: Organization ID
            team_id: Optional team ID filter
            user_id: Optional user ID filter
            status: Optional processing status filter
            include_deleted: Whether to include soft-deleted documents

        Returns:
            List of Document records
        """
        query = select(Document).where(Document.organization_id == org_id)

        if not include_deleted:
            query = query.where(Document.deleted_at.is_(None))

        if team_id:
            query = query.where(
                (Document.team_id.is_(None)) | (Document.team_id == team_id)
            )

        if user_id:
            query = query.where(Document.user_id == user_id)

        if status:
            query = query.where(Document.processing_status == status)

        return list(self.session.exec(query).all())

    async def delete_document(self, document_id: uuid.UUID) -> None:
        """Soft delete document and hard delete embeddings.

        Args:
            document_id: Document ID to delete

        Raises:
            ValueError: If document not found
        """
        logger = get_logger(__name__)

        doc = self.session.get(Document, document_id)
        if not doc:
            raise ValueError(f"Document not found: {document_id}")

        # Soft delete document
        doc.deleted_at = datetime.now(UTC)
        self.session.add(doc)

        # Hard delete embeddings (CASCADE will handle this automatically)
        # But we can be explicit for clarity
        self.session.execute(
            select(DocumentChunk).where(DocumentChunk.document_id == document_id)
        )

        self.session.commit()

        # Delete file from S3/SeaweedFS
        if doc.file_path:
            if s3_delete_document(doc.file_path):
                logger.debug(
                    "document_file_deleted_from_s3",
                    document_id=str(document_id),
                    s3_key=doc.file_path,
                )
            else:
                logger.warning(
                    "document_file_deletion_from_s3_failed",
                    document_id=str(document_id),
                    s3_key=doc.file_path,
                )

    def get_document(self, document_id: uuid.UUID) -> Document | None:
        """Get document by ID.

        Args:
            document_id: Document ID

        Returns:
            Document record or None if not found
        """
        return self.session.get(Document, document_id)

    async def search_documents(
        self,
        query: str,
        org_id: uuid.UUID,
        team_id: uuid.UUID | None,
        user_id: uuid.UUID,
        k: int = 4,
        score_threshold: float = 0.7,
    ) -> list[dict[str, any]]:
        """Search documents using vector similarity.

        Args:
            query: Search query
            org_id: Organization ID
            team_id: Optional team ID
            user_id: User ID
            k: Number of results
            score_threshold: Minimum similarity score

        Returns:
            List of search results with chunk data and scores
        """
        results = await self.vector_store.similarity_search(
            query=query,
            org_id=org_id,
            team_id=team_id,
            user_id=user_id,
            k=k,
            score_threshold=score_threshold,
        )

        # Format results for API response
        formatted_results = []
        for result in results:
            # Parse metadata from JSON string if needed
            metadata = result.metadata_
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except (json.JSONDecodeError, TypeError):
                    metadata = None

            formatted_results.append(
                {
                    "content": result.content,
                    "source": result.filename,
                    "file_type": result.file_type,
                    "metadata": metadata,
                    "relevance_score": round(result.similarity, 3),
                    "chunk_index": result.chunk_index,
                    "document_id": str(result.document_id),
                }
            )
        return formatted_results
