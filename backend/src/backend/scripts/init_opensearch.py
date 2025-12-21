"""OpenSearch Dashboards initialization script.

Automatically creates index patterns and imports default dashboards
so users don't have to manually configure OpenSearch Dashboards.

Usage:
    uv run python -m backend.scripts.init_opensearch

This script:
1. Waits for OpenSearch cluster to be healthy
2. Waits for OpenSearch Dashboards to be ready
3. Imports saved objects (index patterns, visualizations, dashboards)
4. Verifies the import was successful
"""

import json
import logging
import sys
from pathlib import Path

import httpx
from tenacity import (
    RetryError,
    after_log,
    before_log,
    retry,
    stop_after_attempt,
    wait_fixed,
)

from backend.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Configuration
MAX_RETRIES = 30
WAIT_SECONDS = 10
REQUEST_TIMEOUT = 30.0

# Default saved objects to import if no NDJSON file exists
DEFAULT_SAVED_OBJECTS = [
    # App logs index pattern
    {
        "type": "index-pattern",
        "id": "app-logs",
        "attributes": {
            "title": "app-logs-*",
            "timeFieldName": "timestamp",
        },
    },
    # Audit logs index pattern
    {
        "type": "index-pattern",
        "id": "audit-logs",
        "attributes": {
            "title": "audit-logs-*",
            "timeFieldName": "timestamp",
        },
    },
    # Log level distribution visualization
    {
        "type": "visualization",
        "id": "log-level-distribution",
        "attributes": {
            "title": "Log Level Distribution",
            "visState": json.dumps({
                "title": "Log Level Distribution",
                "type": "pie",
                "aggs": [
                    {"id": "1", "enabled": True, "type": "count", "params": {}, "schema": "metric"},
                    {
                        "id": "2",
                        "enabled": True,
                        "type": "terms",
                        "params": {"field": "level", "size": 10, "order": "desc", "orderBy": "1"},
                        "schema": "segment",
                    },
                ],
                "params": {"type": "pie", "addTooltip": True, "addLegend": True, "legendPosition": "right"},
            }),
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": "app-logs",
                    "query": {"query": "", "language": "kuery"},
                    "filter": [],
                })
            },
        },
        "references": [{"id": "app-logs", "name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern"}],
    },
    # Logs over time visualization
    {
        "type": "visualization",
        "id": "logs-over-time",
        "attributes": {
            "title": "Logs Over Time",
            "visState": json.dumps({
                "title": "Logs Over Time",
                "type": "histogram",
                "aggs": [
                    {"id": "1", "enabled": True, "type": "count", "params": {}, "schema": "metric"},
                    {
                        "id": "2",
                        "enabled": True,
                        "type": "date_histogram",
                        "params": {"field": "timestamp", "interval": "auto", "min_doc_count": 1},
                        "schema": "segment",
                    },
                    {
                        "id": "3",
                        "enabled": True,
                        "type": "terms",
                        "params": {"field": "level", "size": 5, "order": "desc", "orderBy": "1"},
                        "schema": "group",
                    },
                ],
                "params": {"type": "histogram", "addTooltip": True, "addLegend": True, "legendPosition": "right"},
            }),
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": "app-logs",
                    "query": {"query": "", "language": "kuery"},
                    "filter": [],
                })
            },
        },
        "references": [{"id": "app-logs", "name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern"}],
    },
    # Error logs visualization
    {
        "type": "visualization",
        "id": "error-logs",
        "attributes": {
            "title": "Recent Errors",
            "visState": json.dumps({
                "title": "Recent Errors",
                "type": "table",
                "aggs": [
                    {"id": "1", "enabled": True, "type": "count", "params": {}, "schema": "metric"},
                    {
                        "id": "2",
                        "enabled": True,
                        "type": "terms",
                        "params": {"field": "message.keyword", "size": 20, "order": "desc", "orderBy": "1"},
                        "schema": "bucket",
                    },
                ],
                "params": {"perPage": 10, "showPartialRows": False, "showTotal": False},
            }),
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": "app-logs",
                    "query": {"query": "level:ERROR OR level:error", "language": "kuery"},
                    "filter": [],
                })
            },
        },
        "references": [{"id": "app-logs", "name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern"}],
    },
    # Audit actions visualization
    {
        "type": "visualization",
        "id": "audit-actions",
        "attributes": {
            "title": "Audit Actions",
            "visState": json.dumps({
                "title": "Audit Actions",
                "type": "pie",
                "aggs": [
                    {"id": "1", "enabled": True, "type": "count", "params": {}, "schema": "metric"},
                    {
                        "id": "2",
                        "enabled": True,
                        "type": "terms",
                        "params": {"field": "action", "size": 20, "order": "desc", "orderBy": "1"},
                        "schema": "segment",
                    },
                ],
                "params": {"type": "pie", "addTooltip": True, "addLegend": True, "legendPosition": "right"},
            }),
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": "audit-logs",
                    "query": {"query": "", "language": "kuery"},
                    "filter": [],
                })
            },
        },
        "references": [{"id": "audit-logs", "name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern"}],
    },
    # Application Logs Dashboard
    {
        "type": "dashboard",
        "id": "application-logs",
        "attributes": {
            "title": "Application Logs",
            "description": "Overview of application logs including log levels, errors, and trends",
            "panelsJSON": json.dumps([
                {
                    "version": "2.18.0",
                    "gridData": {"x": 0, "y": 0, "w": 24, "h": 12, "i": "1"},
                    "panelIndex": "1",
                    "embeddableConfig": {},
                    "panelRefName": "panel_0",
                },
                {
                    "version": "2.18.0",
                    "gridData": {"x": 24, "y": 0, "w": 24, "h": 12, "i": "2"},
                    "panelIndex": "2",
                    "embeddableConfig": {},
                    "panelRefName": "panel_1",
                },
                {
                    "version": "2.18.0",
                    "gridData": {"x": 0, "y": 12, "w": 48, "h": 15, "i": "3"},
                    "panelIndex": "3",
                    "embeddableConfig": {},
                    "panelRefName": "panel_2",
                },
            ]),
            "timeRestore": False,
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({"query": {"query": "", "language": "kuery"}, "filter": []})
            },
        },
        "references": [
            {"id": "log-level-distribution", "name": "panel_0", "type": "visualization"},
            {"id": "logs-over-time", "name": "panel_1", "type": "visualization"},
            {"id": "error-logs", "name": "panel_2", "type": "visualization"},
        ],
    },
    # Audit Logs Dashboard
    {
        "type": "dashboard",
        "id": "audit-logs-dashboard",
        "attributes": {
            "title": "Audit Logs",
            "description": "Security and compliance audit trail",
            "panelsJSON": json.dumps([
                {
                    "version": "2.18.0",
                    "gridData": {"x": 0, "y": 0, "w": 48, "h": 15, "i": "1"},
                    "panelIndex": "1",
                    "embeddableConfig": {},
                    "panelRefName": "panel_0",
                },
            ]),
            "timeRestore": False,
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({"query": {"query": "", "language": "kuery"}, "filter": []})
            },
        },
        "references": [
            {"id": "audit-actions", "name": "panel_0", "type": "visualization"},
        ],
    },
]


def get_opensearch_url() -> str:
    """Get the OpenSearch URL from settings or environment."""
    return settings.OPENSEARCH_URL or "http://opensearch:9200"


def get_dashboards_url() -> str:
    """Get the OpenSearch Dashboards URL."""
    # Dashboards runs on port 5601, derive from OpenSearch URL or use default
    opensearch_url = get_opensearch_url()
    if "localhost" in opensearch_url or "127.0.0.1" in opensearch_url:
        return "http://localhost:5601"
    # In Docker, use service name
    return "http://opensearch-dashboards:5601"


@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_fixed(WAIT_SECONDS),
    before=before_log(logger, logging.INFO),
    after=after_log(logger, logging.WARN),
)
def wait_for_opensearch(client: httpx.Client, url: str) -> None:
    """Wait for OpenSearch cluster to be healthy."""
    response = client.get(
        f"{url}/_cluster/health",
        params={"wait_for_status": "yellow", "timeout": "5s"},
    )
    response.raise_for_status()
    health = response.json()
    logger.info(f"OpenSearch cluster status: {health['status']}")


@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_fixed(WAIT_SECONDS),
    before=before_log(logger, logging.INFO),
    after=after_log(logger, logging.WARN),
)
def wait_for_dashboards(client: httpx.Client, url: str) -> None:
    """Wait for OpenSearch Dashboards to be ready."""
    response = client.get(f"{url}/api/status")
    response.raise_for_status()
    logger.info("OpenSearch Dashboards is ready")


def generate_ndjson(saved_objects: list[dict]) -> str:
    """Generate NDJSON content from saved objects."""
    lines = []
    for obj in saved_objects:
        lines.append(json.dumps(obj))
    return "\n".join(lines)


def import_saved_objects(client: httpx.Client, dashboards_url: str, ndjson_content: str) -> bool:
    """Import saved objects to OpenSearch Dashboards."""
    try:
        response = client.post(
            f"{dashboards_url}/api/saved_objects/_import",
            params={"overwrite": "true"},
            headers={"osd-xsrf": "true"},
            files={"file": ("dashboards.ndjson", ndjson_content, "application/ndjson")},
        )

        if response.status_code == 200:
            result = response.json()
            logger.info(f"Import successful: {result.get('successCount', 0)} objects imported")
            if result.get("errors"):
                for error in result["errors"]:
                    logger.warning(f"Import error: {error}")
            return True
        else:
            logger.error(f"Import failed with status {response.status_code}: {response.text}")
            return False

    except Exception as e:
        logger.error(f"Import failed: {e}")
        return False


def verify_index_patterns(client: httpx.Client, dashboards_url: str) -> None:
    """Verify that index patterns were created."""
    patterns = ["app-logs", "audit-logs"]

    for pattern_id in patterns:
        try:
            response = client.get(
                f"{dashboards_url}/api/saved_objects/index-pattern/{pattern_id}",
                headers={"osd-xsrf": "true"},
            )
            if response.status_code == 200:
                logger.info(f"Index pattern '{pattern_id}' verified")
            else:
                logger.warning(f"Index pattern '{pattern_id}' not found (may be created on first data)")
        except Exception as e:
            logger.warning(f"Could not verify index pattern '{pattern_id}': {e}")


def load_ndjson_file() -> str | None:
    """Load NDJSON from file if it exists."""
    # Check multiple possible locations
    possible_paths = [
        Path(__file__).parent.parent.parent.parent / "opensearch" / "default-dashboards.ndjson",
        Path("/config/default-dashboards.ndjson"),
        Path("backend/opensearch/default-dashboards.ndjson"),
    ]

    for path in possible_paths:
        if path.exists():
            logger.info(f"Loading saved objects from {path}")
            return path.read_text()

    return None


def main() -> int:
    """Main function to initialize OpenSearch Dashboards."""
    logger.info("=" * 50)
    logger.info("OpenSearch Dashboards Initialization")
    logger.info("=" * 50)

    opensearch_url = get_opensearch_url()
    dashboards_url = get_dashboards_url()

    logger.info(f"OpenSearch URL: {opensearch_url}")
    logger.info(f"Dashboards URL: {dashboards_url}")

    if not settings.OPENSEARCH_URL:
        logger.warning("OPENSEARCH_URL not configured, skipping initialization")
        return 0

    with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
        # Wait for services to be ready
        try:
            logger.info("Waiting for OpenSearch cluster...")
            wait_for_opensearch(client, opensearch_url)
        except RetryError:
            logger.error("OpenSearch cluster did not become ready in time")
            return 1

        try:
            logger.info("Waiting for OpenSearch Dashboards...")
            wait_for_dashboards(client, dashboards_url)
        except RetryError:
            logger.error("OpenSearch Dashboards did not become ready in time")
            return 1

        # Load or generate NDJSON content
        ndjson_content = load_ndjson_file()
        if ndjson_content is None:
            logger.info("No NDJSON file found, using default saved objects")
            ndjson_content = generate_ndjson(DEFAULT_SAVED_OBJECTS)

        # Import saved objects
        logger.info("Importing saved objects...")
        if not import_saved_objects(client, dashboards_url, ndjson_content):
            logger.warning("Some objects may not have been imported correctly")

        # Verify import
        verify_index_patterns(client, dashboards_url)

    logger.info("=" * 50)
    logger.info("OpenSearch initialization complete!")
    logger.info("=" * 50)
    logger.info("")
    logger.info(f"Access OpenSearch Dashboards at: {dashboards_url}")
    logger.info("  - Discover: Explore your logs")
    logger.info("  - Dashboard: View pre-configured dashboards")

    return 0


if __name__ == "__main__":
    sys.exit(main())
