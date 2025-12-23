"""API routes for document management.

Handles document upload, listing, retrieval, deletion, and reprocessing.
"""

import json
from typing import Annotated
import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlmodel import select

from backend.audit.schemas import Target
from backend.audit.service import AuditService
from backend.auth.deps import CurrentUser, SessionDep
from backend.core.logging import get_logger
from backend.core.storage import (
    StorageError,
)
from backend.core.storage import (
    get_document_content as storage_get_document_content,
)
from backend.core.storage import (
    upload_document as storage_upload_document,
)
from backend.core.tasks import create_safe_task, process_document_task
from backend.documents.models import (
    DocumentChunk,
    DocumentChunkPublic,
    DocumentPublic,
    DocumentsPublic,
)
from backend.documents.parsers import DocumentParser
from backend.documents.service import DocumentService
from backend.organizations.models import OrganizationMember
from backend.rag_settings.service import get_effective_rag_settings
from backend.rbac.permissions import (
    OrgPermission,
    TeamPermission,
    has_org_permission,
    has_team_permission,
)
from backend.teams.models import TeamMember

logger = get_logger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post(
    "/",
    response_model=DocumentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    session: SessionDep,
    current_user: CurrentUser,
    audit_service: Annotated[AuditService, Depends(AuditService)],
    file: Annotated[UploadFile, File(description="Document file to upload")],
    organization_id: Annotated[uuid.UUID, Form(description="Organization ID")],
    team_id: Annotated[uuid.UUID | None, Form(description="Optional team ID")] = None,
    scope: Annotated[
        str, Form(description="Document scope: org, team, or user")
    ] = "user",
) -> DocumentPublic:
    """Upload a document for RAG processing with enterprise-grade governance.

    File will be validated, uploaded to storage, and queued for background processing.
    Permissions required based on scope:
    - org: DOCUMENTS_UPLOAD_ORG (Owner/Admin only)
    - team: DOCUMENTS_UPLOAD_TEAM (Team Admin only)
    - user: DOCUMENTS_UPLOAD_PERSONAL (Team Member+)

    Args:
        file: Document file to upload
        organization_id: Organization ID
        team_id: Optional team ID for team-scoped documents
        scope: Document scope (org/team/user)
        session: Database session
        current_user: Current authenticated user
        audit_service: Audit logging service

    Returns:
        Created document record

    Raises:
        HTTPException: If validation fails, permission denied, or limits exceeded
    """
    # Verify organization membership
    stmt = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    org_membership = session.exec(stmt).first()
    if not org_membership:
        await audit_service.log(
            "document.upload.forbidden",
            actor=current_user,
            organization_id=organization_id,
            outcome="failure",
            metadata={
                "reason": "not_org_member",
                "attempted_org_id": str(organization_id),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )

    # Get the user's role in the organization
    org_role = org_membership.role

    # RBAC: Check scope-specific permissions
    if scope == "org":
        # Org-level upload: requires org admin/owner
        if not has_org_permission(org_role, OrgPermission.DOCUMENTS_UPLOAD_ORG):
            await audit_service.log(
                "document.upload.forbidden",
                actor=current_user,
                organization_id=organization_id,
                outcome="failure",
                metadata={
                    "reason": "insufficient_permissions",
                    "scope": "org",
                    "required_permission": "DOCUMENTS_UPLOAD_ORG",
                    "user_role": org_role,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization owners and admins can upload org-level documents",
            )
    elif scope == "team":
        # Team-level upload: requires team admin
        if not team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="team_id required for team-scoped documents",
            )

        # Get team membership using org_member_id
        team_membership = session.exec(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.org_member_id == org_membership.id,
            )
        ).first()
        team_role = team_membership.role if team_membership else None

        if not team_membership or not has_team_permission(
            team_role, TeamPermission.DOCUMENTS_UPLOAD_TEAM
        ):
            await audit_service.log(
                "document.upload.forbidden",
                actor=current_user,
                organization_id=organization_id,
                team_id=team_id,
                outcome="failure",
                metadata={
                    "reason": "insufficient_permissions",
                    "scope": "team",
                    "team_id": str(team_id),
                    "required_permission": "DOCUMENTS_UPLOAD_TEAM",
                    "user_role": team_role,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only team admins can upload team-level documents",
            )
    elif scope == "user":
        # Personal upload: requires team membership
        if not team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="team_id required for personal documents",
            )

        # Get team membership using org_member_id
        team_membership = session.exec(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.org_member_id == org_membership.id,
            )
        ).first()
        team_role = team_membership.role if team_membership else None

        if not team_membership or not has_team_permission(
            team_role, TeamPermission.DOCUMENTS_UPLOAD_PERSONAL
        ):
            await audit_service.log(
                "document.upload.forbidden",
                actor=current_user,
                organization_id=organization_id,
                team_id=team_id,
                outcome="failure",
                metadata={
                    "reason": "insufficient_permissions",
                    "scope": "user",
                    "team_id": str(team_id),
                    "required_permission": "DOCUMENTS_UPLOAD_PERSONAL",
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only team members can upload personal documents",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scope: {scope}. Must be org, team, or user",
        )

    # Get effective RAG settings
    rag_settings = get_effective_rag_settings(
        session, current_user.id, organization_id, team_id
    )

    # Check if RAG is enabled
    if not rag_settings.rag_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document upload is disabled for your organization",
        )

    # Validate file type
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required",
        )

    file_ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if file_ext not in rag_settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{file_ext}' not allowed. Allowed types: {', '.join(rag_settings.allowed_file_types)}",
        )

    # Validate file is supported by parser
    if not DocumentParser.is_supported(file_ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{file_ext}' is not supported for processing",
        )

    # Validate file size
    file_size = 0
    if file.size:
        file_size = file.size
    else:
        # Read file to get size if not provided
        content = await file.read()
        file_size = len(content)
        await file.seek(0)  # Reset file pointer

    max_size = rag_settings.max_document_size_mb * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {rag_settings.max_document_size_mb}MB",
        )

    # Check document limit
    doc_service = DocumentService(session)
    user_docs = doc_service.list_documents(
        org_id=organization_id,
        user_id=current_user.id,
        include_deleted=False,
    )

    if len(user_docs) >= rag_settings.max_documents_per_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document limit reached. Maximum: {rag_settings.max_documents_per_user} documents",
        )

    # Upload file to SeaweedFS/S3
    content = await file.read()
    await file.seek(0)  # Reset for potential re-reads

    try:
        # Upload to S3 with hierarchical path based on scope
        s3_object_key = storage_upload_document(
            content=content,
            filename=file.filename,
            content_type=file.content_type or "application/octet-stream",
            org_id=organization_id,
            team_id=team_id if scope in ("team", "user") else None,
            user_id=current_user.id if scope == "user" else None,
        )
        file_path = s3_object_key  # Store S3 key as file_path
    except StorageError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document: {e!s}",
        ) from e

    logger.debug(
        "document_uploaded_to_s3",
        s3_key=s3_object_key,
        file_size=len(content),
        filename=file.filename,
    )

    # Determine user_id based on scope
    doc_user_id = None
    doc_team_id = None
    if scope == "user":
        doc_user_id = current_user.id
        doc_team_id = team_id
    elif scope == "team":
        doc_team_id = team_id
    elif scope == "org":
        pass  # Both None for org-level

    # Create document record
    doc = await doc_service.create_document(
        filename=file.filename,
        file_path=str(file_path),  # Convert Path to string
        file_size=file_size,
        file_type=file_ext,
        mime_type=file.content_type,
        org_id=organization_id,
        team_id=doc_team_id,
        user_id=doc_user_id,
        created_by_id=current_user.id,
    )

    # Trigger background processing task
    # Process document in background (fire-and-forget)
    # In production, use a task queue (Arq/Celery) for better reliability
    create_safe_task(
        process_document_task(
            document_id=doc.id,
            s3_object_key=s3_object_key,  # S3 key for downloading
            org_id=organization_id,
            team_id=doc_team_id,
            user_id=current_user.id,
        ),
        task_name=f"process_document_{doc.id}",
        on_error=lambda e: logger.error(
            "document_processing_task_failed",
            document_id=str(doc.id),
            error=str(e),
        ),
    )

    # Comprehensive audit log for successful upload
    await audit_service.log(
        "document.upload.success",
        actor=current_user,
        organization_id=organization_id,
        team_id=doc_team_id,
        targets=[Target(type="document", id=str(doc.id))],
        outcome="success",
        metadata={
            "filename": file.filename,
            "file_type": file_ext,
            "file_size_bytes": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "scope": scope,
            "team_id": str(team_id) if team_id else None,
            "document_user_id": str(doc_user_id) if doc_user_id else None,
            "processing_status": "queued",
            "mime_type": file.content_type,
            "rag_settings": {
                "chunk_size": rag_settings.chunk_size,
                "chunk_overlap": rag_settings.chunk_overlap,
                "max_document_size_mb": rag_settings.max_document_size_mb,
            },
            "governance": {
                "uploaded_by_role": org_role,
                "permission_used": (
                    "DOCUMENTS_UPLOAD_ORG"
                    if scope == "org"
                    else (
                        "DOCUMENTS_UPLOAD_TEAM"
                        if scope == "team"
                        else "DOCUMENTS_UPLOAD_PERSONAL"
                    )
                ),
            },
        },
    )

    logger.info(
        "document_uploaded",
        document_id=str(doc.id),
        filename=file.filename,
        scope=scope,
        user_id=str(current_user.id),
        org_id=str(organization_id),
        team_id=str(team_id) if team_id else None,
    )

    return DocumentPublic.model_validate(doc)


@router.get("/", response_model=DocumentsPublic)
async def list_documents(
    session: SessionDep,
    current_user: CurrentUser,
    organization_id: Annotated[uuid.UUID, Query(description="Organization ID")],
    team_id: Annotated[
        uuid.UUID | None, Query(description="Optional team ID filter")
    ] = None,
    status_filter: Annotated[
        str | None, Query(description="Optional processing status filter")
    ] = None,
) -> DocumentsPublic:
    """List documents with optional filters.

    Args:
        organization_id: Organization ID
        team_id: Optional team ID filter
        status_filter: Optional processing status filter
        session: Database session
        current_user: Current authenticated user

    Returns:
        Paginated list of documents

    Raises:
        HTTPException: If not authorized
    """
    # Verify organization membership
    stmt = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(stmt).first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )

    doc_service = DocumentService(session)
    docs = doc_service.list_documents(
        org_id=organization_id,
        team_id=team_id,
        user_id=current_user.id,
        status=status_filter,
        include_deleted=False,
    )

    return DocumentsPublic(
        data=[DocumentPublic.model_validate(d) for d in docs],
        count=len(docs),
    )


@router.get("/{document_id}", response_model=DocumentPublic)
async def get_document(
    session: SessionDep,
    current_user: CurrentUser,
    document_id: uuid.UUID,
) -> DocumentPublic:
    """Get document details.

    Args:
        document_id: Document ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Document record

    Raises:
        HTTPException: If not found or not authorized
    """
    doc_service = DocumentService(session)
    doc = doc_service.get_document(document_id)

    if not doc or doc.deleted_at:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Check access permissions
    # User must be the creator or have org/team access
    if doc.user_id and doc.user_id != current_user.id:
        # TODO: Check org/team membership for shared documents
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return DocumentPublic.model_validate(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    session: SessionDep,
    current_user: CurrentUser,
    audit_service: Annotated[AuditService, Depends(AuditService)],
    document_id: uuid.UUID,
) -> None:
    """Delete document and its embeddings.

    Args:
        document_id: Document ID
        session: Database session
        current_user: Current authenticated user
        audit_service: Audit logging service

    Raises:
        HTTPException: If not found or not authorized
    """
    doc_service = DocumentService(session)
    doc = doc_service.get_document(document_id)

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Get user's org membership and role
    stmt = select(OrganizationMember).where(
        OrganizationMember.organization_id == doc.organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    org_membership = session.exec(stmt).first()
    if not org_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )

    org_role = org_membership.role

    can_delete = False
    deletion_reason = None

    # Owner can always delete their own documents
    if doc.created_by_id == current_user.id:
        can_delete = True
        deletion_reason = "document_owner"
    # Org admin can delete any document
    elif has_org_permission(org_role, OrgPermission.DOCUMENTS_DELETE_ANY):
        can_delete = True
        deletion_reason = "org_admin"
    # Team admin can delete team-level documents
    elif doc.team_id and not doc.user_id:
        team_membership = session.exec(
            select(TeamMember).where(
                TeamMember.team_id == doc.team_id,
                TeamMember.org_member_id == org_membership.id,
            )
        ).first()
        if team_membership and has_team_permission(
            team_membership.role, TeamPermission.DOCUMENTS_MANAGE_TEAM
        ):
            can_delete = True
            deletion_reason = "team_admin"

    if not can_delete:
        await audit_service.log(
            "document.delete.forbidden",
            actor=current_user,
            organization_id=doc.organization_id,
            team_id=doc.team_id,
            targets=[Target(type="document", id=str(document_id))],
            outcome="failure",
            metadata={
                "filename": doc.filename,
                "reason": "insufficient_permissions",
                "document_owner": str(doc.created_by_id),
                "document_scope": "org"
                if not doc.team_id
                else ("team" if not doc.user_id else "user"),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete this document",
        )

    # Delete document
    await doc_service.delete_document(document_id)

    # Comprehensive audit log
    await audit_service.log(
        "document.delete.success",
        actor=current_user,
        organization_id=doc.organization_id,
        team_id=doc.team_id,
        targets=[Target(type="document", id=str(document_id))],
        outcome="success",
        metadata={
            "filename": doc.filename,
            "file_type": doc.file_type,
            "file_size_bytes": doc.file_size,
            "scope": "org"
            if not doc.team_id
            else ("team" if not doc.user_id else "user"),
            "team_id": str(doc.team_id) if doc.team_id else None,
            "document_owner": str(doc.created_by_id),
            "chunk_count": doc.chunk_count,
            "processing_status": doc.processing_status,
            "governance": {
                "deleted_by_role": org_role,
                "deletion_reason": deletion_reason,
            },
        },
    )

    logger.info(
        "document_deleted",
        document_id=str(document_id),
        filename=doc.filename,
        deleted_by=str(current_user.id),
        deletion_reason=deletion_reason,
    )


@router.get("/{document_id}/content")
async def get_document_content(
    session: SessionDep,
    current_user: CurrentUser,
    document_id: uuid.UUID,
) -> dict[str, str]:
    """Get full document content for viewing.

    Returns the original file content if available, otherwise reconstructs from chunks.
    This endpoint is used by the document viewer to display the complete document.

    Args:
        document_id: Document ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Dict with content, filename, file_type, and mime_type

    Raises:
        HTTPException: If not found or not authorized
    """
    doc_service = DocumentService(session)
    doc = doc_service.get_document(document_id)

    if not doc or doc.deleted_at:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify organization membership
    stmt = select(OrganizationMember).where(
        OrganizationMember.organization_id == doc.organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(stmt).first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )

    # For user-scoped documents, check if the user owns it
    if doc.user_id and doc.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    content = ""

    # Try to read original file from S3/SeaweedFS
    if doc.file_path:
        try:
            file_bytes = storage_get_document_content(doc.file_path)
            # Try to decode as text
            try:
                content = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                # Binary file or different encoding - try latin-1
                try:
                    content = file_bytes.decode("latin-1")
                except Exception:
                    content = "[Binary file - cannot display as text]"
        except StorageError as e:
            logger.warning(
                "document_read_from_s3_failed",
                document_id=str(document_id),
                s3_key=doc.file_path,
                error=str(e),
            )
            content = None
    else:
        content = None

    # Fallback: reconstruct from chunks if file not available
    if content is None:
        chunks_query = (
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
        )
        chunks = session.exec(chunks_query).all()
        if chunks:
            content = "\n\n".join(chunk.content for chunk in chunks)
        else:
            content = "[No content available]"

    return {
        "content": content,
        "filename": doc.filename,
        "file_type": doc.file_type,
        "mime_type": doc.mime_type or "text/plain",
    }


@router.get("/{document_id}/chunks", response_model=list[DocumentChunkPublic])
async def get_document_chunks(
    session: SessionDep,
    current_user: CurrentUser,
    document_id: uuid.UUID,
) -> list[DocumentChunkPublic]:
    """Get all chunks for a document, ordered by chunk_index.

    This endpoint is used to reconstruct the full document content for viewing.
    Returns chunks with their content and metadata.

    Args:
        document_id: Document ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        List of document chunks ordered by chunk_index

    Raises:
        HTTPException: If not found or not authorized
    """
    doc_service = DocumentService(session)
    doc = doc_service.get_document(document_id)

    if not doc or doc.deleted_at:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify organization membership
    stmt = select(OrganizationMember).where(
        OrganizationMember.organization_id == doc.organization_id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(stmt).first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )

    # For user-scoped documents, check if the user owns it
    # For org/team-scoped documents, org membership is sufficient
    if doc.user_id and doc.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    # Query chunks ordered by chunk_index
    chunks_query = (
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = session.exec(chunks_query).all()

    # Parse metadata from JSON string if needed
    result = []
    for chunk in chunks:
        metadata = chunk.metadata_
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except (json.JSONDecodeError, TypeError):
                metadata = None

        result.append(
            DocumentChunkPublic(
                id=chunk.id,
                document_id=chunk.document_id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                token_count=chunk.token_count,
                metadata_=metadata,
                created_at=chunk.created_at,
            )
        )

    return result


@router.post("/{document_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
async def reprocess_document(
    session: SessionDep,
    current_user: CurrentUser,
    document_id: uuid.UUID,
) -> dict[str, str]:
    """Retry processing a failed document.

    Args:
        document_id: Document ID
        session: Database session
        current_user: Current authenticated user

    Returns:
        Status message

    Raises:
        HTTPException: If not found or not authorized
    """
    doc_service = DocumentService(session)
    doc = doc_service.get_document(document_id)

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Check permissions
    if doc.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    # Only allow reprocessing failed documents
    if doc.processing_status not in ["failed", "pending"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reprocess document with status: {doc.processing_status}",
        )

    # Reset status
    doc.processing_status = "pending"
    doc.processing_error = None
    session.add(doc)
    session.commit()

    # Trigger background reprocessing task
    create_safe_task(
        process_document_task(
            document_id=document_id,
            s3_object_key=doc.file_path,  # file_path now stores S3 object key
            org_id=doc.organization_id,
            team_id=doc.team_id,
            user_id=doc.user_id or current_user.id,
        ),
        task_name=f"reprocess_document_{document_id}",
        on_error=lambda e: logger.error(
            "document_reprocessing_task_failed",
            document_id=str(document_id),
            error=str(e),
        ),
    )

    return {"status": "reprocessing", "message": "Document queued for processing"}
