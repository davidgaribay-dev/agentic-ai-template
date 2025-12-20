import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import Request

from backend.audit.client import (
    APP_INDEX_PREFIX,
    AUDIT_INDEX_PREFIX,
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
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=10000)
        self._worker_task: asyncio.Task | None = None
        self._running = False

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
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

            logger.info("audit_service_stopped")

    async def _process_queue(self) -> None:
        """Background worker that processes the event queue."""
        while self._running:
            try:
                await self._process_single()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("audit_queue_processing_error", error=str(e))
                await asyncio.sleep(1)

    async def _process_single(self) -> None:
        """Process a single item from the queue."""
        try:
            item = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            index_prefix = item.pop("_index_prefix")
            await index_document(index_prefix, item)
            self._queue.task_done()
        except asyncio.TimeoutError:
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
            logger.warning("audit_queue_full", event_id=event_id)

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
            logger.warning("app_log_queue_full", event_id=event_id)

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
        sort = [{params.sort_field: {"order": params.sort_order}}]

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


# Global service instance
audit_service = AuditService()
