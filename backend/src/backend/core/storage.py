import uuid
from functools import lru_cache
from typing import BinaryIO

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
    pass


class InvalidFileTypeError(StorageError):
    """Raised when file type is not allowed."""
    pass


class FileTooLargeError(StorageError):
    """Raised when file exceeds size limit."""
    pass


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
        logger.error("upload_failed", key=object_key, error=str(e))
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

    object_key = url[len(prefix):]

    client = get_s3_client()
    try:
        client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=object_key)
        logger.info("file_deleted", key=object_key)
        return True
    except ClientError as e:
        logger.error("delete_failed", key=object_key, error=str(e))
        return False
