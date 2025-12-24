import asyncio
import contextlib
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from opensearchpy import NotFoundError
from opensearchpy._async.client import AsyncOpenSearch

from backend.core.config import settings
from backend.core.logging import get_logger

logger = get_logger(__name__)

_client: AsyncOpenSearch | None = None
_cleanup_task: asyncio.Task[None] | None = None

AUDIT_INDEX_PREFIX = "audit-logs"
APP_INDEX_PREFIX = "app-logs"

# Retention periods in days
AUDIT_LOG_RETENTION_DAYS = 90
APP_LOG_RETENTION_DAYS = 30

# Cleanup interval (24 hours in seconds)
CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60

AUDIT_INDEX_MAPPINGS = {
    "properties": {
        "id": {"type": "keyword"},
        "timestamp": {"type": "date"},
        "version": {"type": "keyword"},
        "action": {"type": "keyword"},
        "category": {"type": "keyword"},
        "outcome": {"type": "keyword"},
        "severity": {"type": "keyword"},
        "actor": {
            "properties": {
                "id": {"type": "keyword"},
                "email": {"type": "keyword"},
                "ip_address": {"type": "ip"},
                "user_agent": {"type": "text"},
            }
        },
        "targets": {
            "type": "nested",
            "properties": {
                "type": {"type": "keyword"},
                "id": {"type": "keyword"},
                "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            },
        },
        "organization_id": {"type": "keyword"},
        "team_id": {"type": "keyword"},
        "request_id": {"type": "keyword"},
        "session_id": {"type": "keyword"},
        "metadata": {"type": "object", "enabled": True},
        "changes": {"type": "object", "enabled": True},
        "error_code": {"type": "keyword"},
        "error_message": {"type": "text"},
    }
}

APP_INDEX_MAPPINGS = {
    "properties": {
        "id": {"type": "keyword"},
        "timestamp": {"type": "date"},
        "level": {"type": "keyword"},
        "logger": {"type": "keyword"},
        "message": {"type": "text"},
        "request_id": {"type": "keyword"},
        "organization_id": {"type": "keyword"},
        "team_id": {"type": "keyword"},
        "user_id": {"type": "keyword"},
        "module": {"type": "keyword"},
        "function": {"type": "keyword"},
        "line_number": {"type": "integer"},
        "exception_type": {"type": "keyword"},
        "exception_message": {"type": "text"},
        "stack_trace": {"type": "text"},
        "duration_ms": {"type": "float"},
        "extra": {"type": "object", "enabled": True},
    }
}

INDEX_SETTINGS = {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "refresh_interval": "5s",
}


def get_opensearch_client() -> AsyncOpenSearch:
    """Get the global OpenSearch client instance."""
    global _client
    if _client is None:
        raise RuntimeError(
            "OpenSearch client not initialized. Call opensearch_lifespan first."
        )
    return _client


def _get_index_name(prefix: str, date: datetime | None = None) -> str:
    """Generate time-based index name for log rotation.

    Uses daily indices for easier retention management:
    - audit-logs-2025.01.15
    - app-logs-2025.01.15
    """
    if date is None:
        date = datetime.now(UTC)
    return f"{prefix}-{date.strftime('%Y.%m.%d')}"


async def _create_index_template(client: AsyncOpenSearch) -> None:
    """Create index templates for automatic index creation with correct mappings."""
    # Audit logs template
    audit_template = {
        "index_patterns": [f"{AUDIT_INDEX_PREFIX}-*"],
        "template": {
            "settings": INDEX_SETTINGS,
            "mappings": AUDIT_INDEX_MAPPINGS,
        },
        "priority": 100,
    }

    # Application logs template
    app_template = {
        "index_patterns": [f"{APP_INDEX_PREFIX}-*"],
        "template": {
            "settings": INDEX_SETTINGS,
            "mappings": APP_INDEX_MAPPINGS,
        },
        "priority": 100,
    }

    try:
        await client.indices.put_index_template(
            name="audit-logs-template",
            body=audit_template,
        )
        logger.info("opensearch_template_created", template="audit-logs-template")

        await client.indices.put_index_template(
            name="app-logs-template",
            body=app_template,
        )
        logger.info("opensearch_template_created", template="app-logs-template")
    except Exception as e:
        logger.exception("opensearch_template_creation_failed", error=str(e))
        raise


async def _ensure_index_exists(
    client: AsyncOpenSearch,
    index_name: str,
    mappings: dict[str, Any],
) -> None:
    """Ensure an index exists with the correct mappings."""
    try:
        exists = await client.indices.exists(index=index_name)
        if not exists:
            await client.indices.create(
                index=index_name,
                body={"settings": INDEX_SETTINGS, "mappings": mappings},
            )
            logger.info("opensearch_index_created", index=index_name)
    except Exception as e:
        # Index might have been created by another process
        if "resource_already_exists_exception" not in str(e).lower():
            logger.exception(
                "opensearch_index_creation_failed", index=index_name, error=str(e)
            )
            raise


@asynccontextmanager
async def opensearch_lifespan():
    """Async context manager for OpenSearch client lifecycle."""
    global _client

    if not settings.OPENSEARCH_URL:
        logger.warning("opensearch_disabled", reason="OPENSEARCH_URL not configured")
        yield
        return

    try:
        url = settings.OPENSEARCH_URL
        use_ssl = url.startswith("https://")
        host = url.replace("https://", "").replace("http://", "")

        if ":" in host:
            host_part, port_part = host.rsplit(":", 1)
            port = int(port_part)
            host = host_part
        else:
            port = 443 if use_ssl else 9200

        _client = AsyncOpenSearch(
            hosts=[{"host": host, "port": port}],
            use_ssl=use_ssl,
            verify_certs=settings.OPENSEARCH_VERIFY_CERTS,
            ssl_show_warn=False,
            pool_maxsize=10,
            retry_on_timeout=True,
            max_retries=3,
        )

        info = await _client.info()
        logger.info(
            "opensearch_connected",
            cluster_name=info["cluster_name"],
            version=info["version"]["number"],
        )

        await _create_index_template(_client)

        today = datetime.now(UTC)
        await _ensure_index_exists(
            _client,
            _get_index_name(AUDIT_INDEX_PREFIX, today),
            AUDIT_INDEX_MAPPINGS,
        )
        await _ensure_index_exists(
            _client,
            _get_index_name(APP_INDEX_PREFIX, today),
            APP_INDEX_MAPPINGS,
        )

        # Run initial cleanup on startup and start periodic scheduler
        await run_scheduled_cleanup()
        start_cleanup_scheduler()

        yield

    except Exception as e:
        logger.exception("opensearch_connection_failed", error=str(e))
        yield

    finally:
        # Stop cleanup scheduler before closing client
        await stop_cleanup_scheduler()

        if _client is not None:
            await _client.close()
            _client = None
            logger.info("opensearch_disconnected")


async def index_document(
    index_prefix: str,
    document: dict[str, Any],
    document_id: str | None = None,
) -> bool:
    """Index a document (audit event or app log) to OpenSearch.

    Args:
        index_prefix: Either AUDIT_INDEX_PREFIX or APP_INDEX_PREFIX
        document: The document to index
        document_id: Optional document ID (uses event id if not provided)

    Returns:
        True if successful, False otherwise
    """
    if _client is None:
        return False

    try:
        index_name = _get_index_name(index_prefix)
        doc_id = document_id or document.get("id")

        await _client.index(
            index=index_name,
            id=doc_id,
            body=document,
            refresh=False,
        )
    except Exception as e:
        logger.exception(
            "opensearch_index_failed",
            index_prefix=index_prefix,
            error=str(e),
        )
        return False
    else:
        return True


async def bulk_index_documents(
    index_prefix: str,
    documents: list[dict[str, Any]],
) -> tuple[int, int]:
    """Bulk index multiple documents to OpenSearch.

    More efficient than individual index_document calls for high-volume logging.

    Args:
        index_prefix: Either AUDIT_INDEX_PREFIX or APP_INDEX_PREFIX
        documents: List of documents to index

    Returns:
        Tuple of (success_count, error_count)
    """
    if _client is None or not documents:
        return 0, len(documents) if documents else 0

    index_name = _get_index_name(index_prefix)
    success_count = 0
    error_count = 0

    # Build bulk request body
    bulk_body: list[dict[str, Any]] = []
    for doc in documents:
        doc_id = doc.get("id")
        # Action line
        bulk_body.append({"index": {"_index": index_name, "_id": doc_id}})
        # Document line
        bulk_body.append(doc)

    try:
        response = await _client.bulk(body=bulk_body, refresh=False)

        # Count successes and failures
        if response.get("errors"):
            for item in response.get("items", []):
                if "error" in item.get("index", {}):
                    error_count += 1
                else:
                    success_count += 1
        else:
            success_count = len(documents)

        if error_count > 0:
            logger.warning(
                "opensearch_bulk_index_partial_failure",
                index_prefix=index_prefix,
                success_count=success_count,
                error_count=error_count,
            )
    except Exception as e:
        logger.exception(
            "opensearch_bulk_index_failed",
            index_prefix=index_prefix,
            document_count=len(documents),
            error=str(e),
        )
        return 0, len(documents)
    else:
        return success_count, error_count


async def search_logs(
    index_prefix: str,
    query: dict[str, Any],
    skip: int = 0,
    limit: int = 50,
    sort: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Search logs in OpenSearch.

    Args:
        index_prefix: Either AUDIT_INDEX_PREFIX or APP_INDEX_PREFIX
        query: OpenSearch query DSL
        skip: Number of results to skip
        limit: Maximum results to return
        sort: Sort configuration

    Returns:
        Tuple of (results, total_count)
    """
    if _client is None:
        return [], 0

    try:
        # Search across all indices with this prefix
        index_pattern = f"{index_prefix}-*"

        body = {
            "query": query,
            "from": skip,
            "size": limit,
            "sort": sort or [{"timestamp": {"order": "desc"}}],
        }

        response = await _client.search(
            index=index_pattern,
            body=body,
        )

        hits = response["hits"]
        total = hits["total"]["value"]
        results = [hit["_source"] for hit in hits["hits"]]
    except NotFoundError:
        # No indices exist yet
        return [], 0
    except Exception as e:
        logger.exception(
            "opensearch_search_failed",
            index_prefix=index_prefix,
            error=str(e),
        )
        return [], 0
    else:
        return results, total


async def delete_old_indices(
    index_prefix: str,
    days_to_keep: int = 90,
) -> list[str]:
    """Delete indices older than the retention period.

    Args:
        index_prefix: Either AUDIT_INDEX_PREFIX or APP_INDEX_PREFIX
        days_to_keep: Number of days to retain logs

    Returns:
        List of deleted index names
    """
    if _client is None:
        return []

    try:
        # Get all indices matching the pattern
        indices = await _client.indices.get(index=f"{index_prefix}-*")

        deleted = []
        cutoff = datetime.now(UTC)

        for index_name in indices:
            try:
                # Parse date from index name (prefix-YYYY.MM.DD)
                date_str = index_name.split("-")[-1]
                index_date = datetime.strptime(date_str, "%Y.%m.%d").replace(tzinfo=UTC)

                age_days = (cutoff - index_date).days
                if age_days > days_to_keep:
                    await _client.indices.delete(index=index_name)
                    deleted.append(index_name)
                    logger.info(
                        "opensearch_index_deleted",
                        index=index_name,
                        age_days=age_days,
                    )
            except (ValueError, IndexError):
                # Skip indices with unexpected naming
                continue
    except Exception as e:
        logger.exception("opensearch_retention_cleanup_failed", error=str(e))
        return []
    else:
        return deleted


async def run_scheduled_cleanup() -> None:
    """Run cleanup for both audit and app log indices.

    This function is called on startup and then periodically.
    """
    audit_deleted = await delete_old_indices(
        AUDIT_INDEX_PREFIX, days_to_keep=AUDIT_LOG_RETENTION_DAYS
    )
    app_deleted = await delete_old_indices(
        APP_INDEX_PREFIX, days_to_keep=APP_LOG_RETENTION_DAYS
    )

    if audit_deleted or app_deleted:
        logger.info(
            "opensearch_scheduled_cleanup_completed",
            audit_indices_deleted=len(audit_deleted),
            app_indices_deleted=len(app_deleted),
        )


async def _periodic_cleanup_task() -> None:
    """Background task that runs index cleanup periodically."""
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            await run_scheduled_cleanup()
        except asyncio.CancelledError:
            logger.info("opensearch_cleanup_task_cancelled")
            break
        except Exception as e:
            logger.exception("opensearch_cleanup_task_error", error=str(e))
            # Continue running even after errors


def start_cleanup_scheduler() -> None:
    """Start the background cleanup task."""
    global _cleanup_task
    if _cleanup_task is None or _cleanup_task.done():
        _cleanup_task = asyncio.create_task(_periodic_cleanup_task())
        logger.info("opensearch_cleanup_scheduler_started")


async def stop_cleanup_scheduler() -> None:
    """Stop the background cleanup task."""
    global _cleanup_task
    if _cleanup_task is not None and not _cleanup_task.done():
        _cleanup_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _cleanup_task
        _cleanup_task = None
        logger.info("opensearch_cleanup_scheduler_stopped")
