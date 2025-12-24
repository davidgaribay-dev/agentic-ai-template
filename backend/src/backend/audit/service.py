import asyncio
import contextlib
from datetime import UTC, datetime
from typing import Any
import uuid

from fastapi import Request

from backend.audit.client import (
    APP_INDEX_PREFIX,
    AUDIT_INDEX_PREFIX,
    bulk_index_documents,
    index_document,
    search_logs,
)
from backend.audit.schemas import (
    Actor,
    AppLogEvent,
    AuditAction,
    AuditEvent,
    AuditLogQuery,
    AuditLogResponse,
    LogLevel,
    Target,
)
from backend.auth.models import User
from backend.core.logging import get_logger

logger = get_logger(__name__)


class AuditService:
    """Service for recording audit events and application logs.

    This service provides a high-level interface for logging events
    to OpenSearch with proper formatting and async handling.

    Dropped events are tracked via _dropped_count for monitoring.
    When the queue is full, events are logged with severity and dropped.
    """

    # Queue capacity for async event processing
    QUEUE_MAX_SIZE = 10000

    # Batch size for bulk indexing (balance between efficiency and latency)
    BATCH_SIZE = 50

    # Maximum wait time before flushing a partial batch (seconds)
    BATCH_FLUSH_INTERVAL = 2.0

    def __init__(self) -> None:
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(
            maxsize=self.QUEUE_MAX_SIZE
        )
        self._worker_task: asyncio.Task | None = None
        self._running = False
        self._dropped_count = 0  # Track dropped events for monitoring

    async def start(self) -> None:
        """Start the background worker for async log processing."""
        if self._running:
            return

        self._running = True
        self._worker_task = asyncio.create_task(self._process_queue())
        logger.info("audit_service_started")

    async def stop(self) -> None:
        """Stop the background worker and flush remaining events."""
        self._running = False

        if self._worker_task:
            # Process remaining items
            while not self._queue.empty():
                await self._process_single()

            self._worker_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._worker_task

            logger.info("audit_service_stopped")

    async def _process_queue(self) -> None:
        """Background worker that processes the event queue with batching."""
        while self._running:
            try:
                await self._process_batch()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("audit_queue_processing_error", error=str(e))
                await asyncio.sleep(1)

    async def _process_batch(self) -> None:
        """Collect and process a batch of items from the queue.

        Collects up to BATCH_SIZE items or waits BATCH_FLUSH_INTERVAL seconds,
        whichever comes first. Uses bulk indexing for efficiency.
        """
        audit_batch: list[dict[str, Any]] = []
        app_batch: list[dict[str, Any]] = []
        batch_start = asyncio.get_event_loop().time()

        # Collect items until batch is full or timeout
        while len(audit_batch) + len(app_batch) < self.BATCH_SIZE:
            elapsed = asyncio.get_event_loop().time() - batch_start
            remaining = max(0.1, self.BATCH_FLUSH_INTERVAL - elapsed)

            try:
                item = await asyncio.wait_for(self._queue.get(), timeout=remaining)
                index_prefix = item.pop("_index_prefix")

                if index_prefix == AUDIT_INDEX_PREFIX:
                    audit_batch.append(item)
                else:
                    app_batch.append(item)

                self._queue.task_done()
            except TimeoutError:
                # Flush interval reached, process what we have
                break

        # Process collected batches
        if audit_batch:
            if len(audit_batch) == 1:
                await index_document(AUDIT_INDEX_PREFIX, audit_batch[0])
            else:
                await bulk_index_documents(AUDIT_INDEX_PREFIX, audit_batch)

        if app_batch:
            if len(app_batch) == 1:
                await index_document(APP_INDEX_PREFIX, app_batch[0])
            else:
                await bulk_index_documents(APP_INDEX_PREFIX, app_batch)

    async def _process_single(self) -> None:
        """Process a single item from the queue (used during shutdown)."""
        try:
            item = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            index_prefix = item.pop("_index_prefix")
            await index_document(index_prefix, item)
            self._queue.task_done()
        except TimeoutError:
            pass

    def _extract_request_context(
        self,
        request: Request | None,
    ) -> tuple[str | None, str | None, str | None]:
        """Extract IP, user agent, and request ID from a request."""
        if request is None:
            return None, None, None

        # Get client IP (handle proxies)
        ip_address = request.headers.get("X-Forwarded-For")
        if ip_address:
            ip_address = ip_address.split(",")[0].strip()
        else:
            ip_address = request.client.host if request.client else None

        user_agent = request.headers.get("User-Agent")
        request_id = request.headers.get("X-Request-ID")

        return ip_address, user_agent, request_id

    async def log(
        self,
        action: AuditAction | str,
        *,
        actor: User | None = None,
        targets: list[Target] | None = None,
        organization_id: uuid.UUID | None = None,
        team_id: uuid.UUID | None = None,
        outcome: str = "success",
        severity: LogLevel = LogLevel.INFO,
        request: Request | None = None,
        metadata: dict[str, Any] | None = None,
        changes: dict[str, Any] | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> str:
        """Record an audit event.

        This is the primary method for logging audit events. It handles
        all the formatting and queues the event for async processing.

        Args:
            action: The action being logged (use AuditAction enum when possible)
            actor: The user performing the action
            targets: Resources affected by the action
            organization_id: Organization context
            team_id: Team context
            outcome: "success", "failure", or "unknown"
            severity: Log severity level
            request: FastAPI request for extracting context
            metadata: Additional event-specific data
            changes: Before/after state for updates
            error_code: Error code for failures
            error_message: Error description for failures

        Returns:
            The event ID
        """
        event_id = str(uuid.uuid4())
        ip_address, user_agent, request_id = self._extract_request_context(request)

        actor_data = Actor(
            id=actor.id if actor else None,
            email=actor.email if actor else None,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        event = AuditEvent(
            id=event_id,
            timestamp=datetime.now(UTC),
            action=action.value if isinstance(action, AuditAction) else action,
            category="audit",
            outcome=outcome,
            severity=severity,
            actor=actor_data,
            targets=targets or [],
            organization_id=organization_id,
            team_id=team_id,
            request_id=request_id,
            metadata=metadata or {},
            changes=changes,
            error_code=error_code,
            error_message=error_message,
        )

        try:
            document = event.model_dump(mode="json")
            document["_index_prefix"] = AUDIT_INDEX_PREFIX
            self._queue.put_nowait(document)
        except asyncio.QueueFull:
            self._dropped_count += 1
            logger.warning(
                "audit_queue_full",
                event_id=event_id,
                action=event.action,
                dropped_total=self._dropped_count,
                queue_size=self._queue.qsize(),
            )

        return event_id

    async def log_app(
        self,
        level: LogLevel,
        logger_name: str,
        message: str,
        *,
        request_id: str | None = None,
        organization_id: uuid.UUID | None = None,
        team_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        module: str | None = None,
        function: str | None = None,
        line_number: int | None = None,
        exception_type: str | None = None,
        exception_message: str | None = None,
        stack_trace: str | None = None,
        duration_ms: float | None = None,
        extra: dict[str, Any] | None = None,
    ) -> str:
        """Record an application log event.

        Use this for operational logs that need searchability
        but aren't compliance-relevant audit events.

        Args:
            level: Log severity level
            logger_name: Name of the logger
            message: Log message
            request_id: Request correlation ID
            organization_id: Organization context
            team_id: Team context
            user_id: User context
            module: Python module name
            function: Function name
            line_number: Line number in source
            exception_type: Exception class name
            exception_message: Exception message
            stack_trace: Full stack trace
            duration_ms: Operation duration
            extra: Additional context

        Returns:
            The event ID
        """
        event_id = str(uuid.uuid4())

        event = AppLogEvent(
            id=event_id,
            timestamp=datetime.now(UTC),
            level=level,
            logger=logger_name,
            message=message,
            request_id=request_id,
            organization_id=organization_id,
            team_id=team_id,
            user_id=user_id,
            module=module,
            function=function,
            line_number=line_number,
            exception_type=exception_type,
            exception_message=exception_message,
            stack_trace=stack_trace,
            duration_ms=duration_ms,
            extra=extra or {},
        )

        try:
            document = event.model_dump(mode="json")
            document["_index_prefix"] = APP_INDEX_PREFIX
            self._queue.put_nowait(document)
        except asyncio.QueueFull:
            self._dropped_count += 1
            logger.warning(
                "app_log_queue_full",
                event_id=event_id,
                level=level.value,
                dropped_total=self._dropped_count,
                queue_size=self._queue.qsize(),
            )

        return event_id

    async def query(self, params: AuditLogQuery) -> AuditLogResponse:
        """Query audit logs with filtering and pagination.

        Args:
            params: Query parameters

        Returns:
            Matching audit events with pagination info
        """
        must_clauses: list[dict[str, Any]] = []
        filter_clauses: list[dict[str, Any]] = []

        # Time range
        if params.start_time or params.end_time:
            time_range: dict[str, Any] = {}
            if params.start_time:
                time_range["gte"] = params.start_time.isoformat()
            if params.end_time:
                time_range["lte"] = params.end_time.isoformat()
            filter_clauses.append({"range": {"timestamp": time_range}})

        # Action filter
        if params.actions:
            filter_clauses.append({"terms": {"action": params.actions}})

        # Actor filters
        if params.actor_id:
            filter_clauses.append({"term": {"actor.id": str(params.actor_id)}})
        if params.actor_email:
            filter_clauses.append({"term": {"actor.email": params.actor_email}})

        # Multi-tenant filters
        if params.organization_id:
            filter_clauses.append(
                {"term": {"organization_id": str(params.organization_id)}}
            )
        if params.team_id:
            filter_clauses.append({"term": {"team_id": str(params.team_id)}})

        # Target filters
        if params.target_type or params.target_id:
            nested_query: dict[str, Any] = {"bool": {"must": []}}
            if params.target_type:
                nested_query["bool"]["must"].append(
                    {"term": {"targets.type": params.target_type}}
                )
            if params.target_id:
                nested_query["bool"]["must"].append(
                    {"term": {"targets.id": params.target_id}}
                )
            filter_clauses.append(
                {"nested": {"path": "targets", "query": nested_query}}
            )

        # Outcome filter
        if params.outcome:
            filter_clauses.append({"term": {"outcome": params.outcome}})

        # Full-text search
        if params.query:
            must_clauses.append(
                {
                    "multi_match": {
                        "query": params.query,
                        "fields": [
                            "action",
                            "actor.email",
                            "targets.name",
                            "error_message",
                            "metadata.*",
                        ],
                    }
                }
            )

        # Build final query
        query: dict[str, Any] = {"bool": {}}
        if must_clauses:
            query["bool"]["must"] = must_clauses
        if filter_clauses:
            query["bool"]["filter"] = filter_clauses

        # If no clauses, match all
        if not must_clauses and not filter_clauses:
            query = {"match_all": {}}

        # Sort configuration
        sort: list[dict[str, Any]] = [{params.sort_field: {"order": params.sort_order}}]

        # Execute search
        results, total = await search_logs(
            AUDIT_INDEX_PREFIX,
            query,
            skip=params.skip,
            limit=params.limit,
            sort=sort,
        )

        # Convert to response
        events = [AuditEvent(**doc) for doc in results]

        return AuditLogResponse(
            events=events,
            total=total,
            skip=params.skip,
            limit=params.limit,
        )

    def get_stats(self) -> dict[str, Any]:
        """Get service statistics for monitoring.

        Returns:
            Dict with queue_size, dropped_count, and running status
        """
        return {
            "queue_size": self._queue.qsize(),
            "queue_max_size": self.QUEUE_MAX_SIZE,
            "dropped_count": self._dropped_count,
            "running": self._running,
        }


# Global service instance
audit_service = AuditService()
