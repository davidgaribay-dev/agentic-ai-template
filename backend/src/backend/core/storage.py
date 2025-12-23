from functools import lru_cache
from typing import BinaryIO
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from backend.core.config import settings
from backend.core.logging import get_logger

logger = get_logger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

MAX_FILE_SIZE = 5 * 1024 * 1024


class StorageError(Exception):
    """Base exception for storage operations."""


class InvalidFileTypeError(StorageError):
    """Raised when file type is not allowed."""


class FileTooLargeError(StorageError):
    """Raised when file exceeds size limit."""


@lru_cache(maxsize=1)
def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )


def ensure_bucket_exists(client=None) -> None:
    if client is None:
        client = get_s3_client()

    try:
        client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ("404", "NoSuchBucket"):
            logger.info("creating_bucket", bucket=settings.S3_BUCKET_NAME)
            client.create_bucket(Bucket=settings.S3_BUCKET_NAME)
        else:
            raise StorageError(f"Failed to check bucket: {e}") from e


def upload_file(
    file: BinaryIO,
    content_type: str,
    folder: str = "profile-images",
    filename: str | None = None,
) -> str:
    """Upload a file to S3-compatible storage.

    Args:
        file: File-like object to upload
        content_type: MIME type of the file
        folder: Folder path within the bucket
        filename: Optional custom filename (without extension)

    Returns:
        The full URL to access the uploaded file

    Raises:
        InvalidFileTypeError: If content type is not allowed
        FileTooLargeError: If file exceeds size limit
        StorageError: For other storage errors
    """
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise InvalidFileTypeError(
            f"Invalid file type: {content_type}. Allowed types: {', '.join(ALLOWED_IMAGE_TYPES.keys())}"
        )

    content = file.read()
    if len(content) > MAX_FILE_SIZE:
        raise FileTooLargeError(
            f"File too large: {len(content)} bytes. Maximum size: {MAX_FILE_SIZE} bytes"
        )

    extension = ALLOWED_IMAGE_TYPES[content_type]
    if filename is None:
        filename = str(uuid.uuid4())
    object_key = f"{folder}/{filename}{extension}"

    client = get_s3_client()
    ensure_bucket_exists(client)

    try:
        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )
        logger.info("file_uploaded", key=object_key, size=len(content))
    except ClientError as e:
        logger.exception("upload_failed", key=object_key, error=str(e))
        raise StorageError(f"Failed to upload file: {e}") from e

    return f"{settings.s3_public_base_url}/{settings.S3_BUCKET_NAME}/{object_key}"


def delete_file(url: str) -> bool:
    """Delete a file from S3-compatible storage.

    Args:
        url: The full URL of the file to delete

    Returns:
        True if deleted successfully, False if file didn't exist
    """
    prefix = f"{settings.s3_public_base_url}/{settings.S3_BUCKET_NAME}/"
    if not url.startswith(prefix):
        logger.warning("invalid_url_for_deletion", url=url)
        return False

    object_key = url[len(prefix) :]

    client = get_s3_client()
    try:
        client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=object_key)
        logger.info("file_deleted", key=object_key)
    except ClientError as e:
        logger.exception("delete_failed", key=object_key, error=str(e))
        return False
    else:
        return True


def upload_document(
    content: bytes,
    filename: str,
    content_type: str,
    org_id: uuid.UUID,
    team_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> str:
    """Upload a document to S3-compatible storage (SeaweedFS).

    Documents are stored with a hierarchical path:
    - Org-level: documents/{org_id}/{uuid}_{filename}
    - Team-level: documents/{org_id}/{team_id}/{uuid}_{filename}
    - User-level: documents/{org_id}/{team_id}/{user_id}/{uuid}_{filename}

    Args:
        content: File content as bytes
        filename: Original filename
        content_type: MIME type of the file
        org_id: Organization ID
        team_id: Optional team ID
        user_id: Optional user ID (for user-scoped documents)

    Returns:
        The S3 object key (path) for the uploaded file

    Raises:
        StorageError: For storage errors
    """
    # Build hierarchical path
    path_parts = ["documents", str(org_id)]
    if team_id:
        path_parts.append(str(team_id))
    if user_id:
        path_parts.append(str(user_id))

    # Add unique prefix to filename to avoid collisions
    unique_filename = f"{uuid.uuid4()}_{filename}"
    path_parts.append(unique_filename)
    object_key = "/".join(path_parts)

    client = get_s3_client()
    ensure_bucket_exists(client)

    try:
        client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=object_key,
            Body=content,
            ContentType=content_type or "application/octet-stream",
        )
        logger.info("document_uploaded", key=object_key, size=len(content))
    except ClientError as e:
        logger.exception("document_upload_failed", key=object_key, error=str(e))
        raise StorageError(f"Failed to upload document: {e}") from e

    return object_key


def get_document_content(object_key: str) -> bytes:
    """Download document content from S3-compatible storage.

    Args:
        object_key: The S3 object key (path) of the document

    Returns:
        The file content as bytes

    Raises:
        StorageError: If file not found or download fails
    """
    client = get_s3_client()

    try:
        response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=object_key)
        content = response["Body"].read()
        logger.debug("document_downloaded", key=object_key, size=len(content))
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code == "NoSuchKey":
            raise StorageError(f"Document not found: {object_key}") from e
        logger.exception("document_download_failed", key=object_key, error=str(e))
        raise StorageError(f"Failed to download document: {e}") from e
    else:
        return content


def delete_document(object_key: str) -> bool:
    """Delete a document from S3-compatible storage.

    Args:
        object_key: The S3 object key (path) of the document

    Returns:
        True if deleted successfully, False if file didn't exist
    """
    client = get_s3_client()
    try:
        client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=object_key)
        logger.info("document_deleted", key=object_key)
    except ClientError as e:
        logger.exception("document_delete_failed", key=object_key, error=str(e))
        return False
    else:
        return True


def get_document_url(object_key: str) -> str:
    """Get the public URL for a document.

    Args:
        object_key: The S3 object key (path) of the document

    Returns:
        The full URL to access the document
    """
    return f"{settings.s3_public_base_url}/{settings.S3_BUCKET_NAME}/{object_key}"
