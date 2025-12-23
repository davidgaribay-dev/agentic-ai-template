import csv
from datetime import datetime
import io
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from backend.audit.schemas import AuditAction, AuditLogQuery, AuditLogResponse
from backend.audit.service import audit_service
from backend.auth.deps import CurrentUser
from backend.core.logging import get_logger
from backend.organizations.models import OrganizationMember
from backend.rbac.deps import require_org_permission
from backend.rbac.permissions import OrgPermission

router = APIRouter()
logger = get_logger(__name__)

# Maximum number of days allowed in audit log export time range
MAX_AUDIT_EXPORT_DAYS = 90


async def _get_org_membership(
    organization_id: UUID,
    current_user: CurrentUser,
) -> OrganizationMember:
    """Get and validate org membership with audit permission."""
    raise NotImplementedError("Validation is done via route dependencies")


@router.get(
    "/organizations/{organization_id}/audit-logs",
    response_model=AuditLogResponse,
)
async def list_audit_logs(
    organization_id: UUID,
    current_user: CurrentUser,
    _: None = Depends(require_org_permission(OrgPermission.ORG_READ)),
    # Time filters
    start_time: datetime | None = Query(
        None, description="Filter events after this time"
    ),
    end_time: datetime | None = Query(
        None, description="Filter events before this time"
    ),
    # Action filters
    actions: list[str] | None = Query(None, description="Filter by action types"),
    # Actor filters
    actor_id: UUID | None = Query(None, description="Filter by actor user ID"),
    actor_email: str | None = Query(None, description="Filter by actor email"),
    # Resource filters
    team_id: UUID | None = Query(None, description="Filter by team ID"),
    target_type: str | None = Query(None, description="Filter by target type"),
    target_id: str | None = Query(None, description="Filter by target ID"),
    outcome: str | None = Query(
        None, description="Filter by outcome (success/failure)"
    ),
    # Full-text search
    query: str | None = Query(None, description="Full-text search query"),
    # Pagination
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=1000, description="Maximum records to return"),
    # Sorting
    sort_field: str = Query("timestamp", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
) -> AuditLogResponse:
    """Query audit logs for an organization.

    Returns paginated audit events with filtering and search capabilities.
    Only organization owners and admins can access audit logs.
    """
    query_params = AuditLogQuery(
        start_time=start_time,
        end_time=end_time,
        actions=actions,
        actor_id=actor_id,
        actor_email=actor_email,
        organization_id=organization_id,
        team_id=team_id,
        target_type=target_type,
        target_id=target_id,
        outcome=outcome,
        query=query,
        skip=skip,
        limit=limit,
        sort_field=sort_field,
        sort_order=sort_order,
    )

    return await audit_service.query(query_params)


@router.get(
    "/organizations/{organization_id}/audit-logs/export",
    response_class=StreamingResponse,
)
async def export_audit_logs(
    organization_id: UUID,
    current_user: CurrentUser,
    _: None = Depends(require_org_permission(OrgPermission.ORG_READ)),
    # Time filters (required for export to limit data volume)
    start_time: datetime = Query(..., description="Export events after this time"),
    end_time: datetime = Query(..., description="Export events before this time"),
    # Optional filters
    actions: list[str] | None = Query(None, description="Filter by action types"),
    team_id: UUID | None = Query(None, description="Filter by team ID"),
    outcome: str | None = Query(None, description="Filter by outcome"),
    format: str = Query("csv", description="Export format (csv)"),
) -> StreamingResponse:
    """Export audit logs as CSV for compliance reporting.

    Requires a time range to limit data volume. Maximum export is 10,000 events.
    """
    if format != "csv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV format is currently supported",
        )

    # Validate time range (max 90 days)
    time_diff = end_time - start_time
    if time_diff.days > MAX_AUDIT_EXPORT_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Export time range cannot exceed {MAX_AUDIT_EXPORT_DAYS} days",
        )

    query_params = AuditLogQuery(
        start_time=start_time,
        end_time=end_time,
        actions=actions,
        organization_id=organization_id,
        team_id=team_id,
        outcome=outcome,
        skip=0,
        limit=10000,  # Max export limit
        sort_field="timestamp",
        sort_order="asc",
    )

    result = await audit_service.query(query_params)

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(
        [
            "timestamp",
            "action",
            "outcome",
            "severity",
            "actor_id",
            "actor_email",
            "actor_ip",
            "target_type",
            "target_id",
            "target_name",
            "organization_id",
            "team_id",
            "request_id",
            "error_code",
            "error_message",
        ]
    )

    for event in result.events:
        # Get first target if any
        target = event.targets[0] if event.targets else None

        writer.writerow(
            [
                event.timestamp.isoformat(),
                event.action,
                event.outcome,
                event.severity.value,
                str(event.actor.id) if event.actor.id else "",
                event.actor.email or "",
                event.actor.ip_address or "",
                target.type if target else "",
                target.id if target else "",
                target.name if target else "",
                str(event.organization_id) if event.organization_id else "",
                str(event.team_id) if event.team_id else "",
                event.request_id or "",
                event.error_code or "",
                event.error_message or "",
            ]
        )

    output.seek(0)

    # Generate filename with timestamp
    filename = f"audit-logs-{organization_id}-{start_time.strftime('%Y%m%d')}-{end_time.strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get(
    "/organizations/{organization_id}/audit-logs/actions",
    response_model=list[str],
)
async def list_audit_actions(
    organization_id: UUID,
    current_user: CurrentUser,
    _: None = Depends(require_org_permission(OrgPermission.ORG_READ)),
) -> list[str]:
    """List all available audit action types.

    Returns the list of action types that can be used for filtering.
    """
    return [action.value for action in AuditAction]
