from datetime import UTC, datetime
import uuid

from sqlmodel import Session, func, select

from backend.invitations.models import (
    Invitation,
    InvitationCreate,
    InvitationStatus,
)


def create_invitation(
    session: Session,
    organization_id: uuid.UUID,
    invited_by_id: uuid.UUID,
    invitation_in: InvitationCreate,
) -> tuple[Invitation, str]:
    """Create a new invitation.

    Args:
        session: Database session
        organization_id: Organization UUID
        invited_by_id: User UUID who is sending the invitation
        invitation_in: Invitation creation data

    Returns:
        Tuple of (Invitation, raw_token)
        The raw token should be sent to the user via email.
    """
    invitation, token = Invitation.create_with_token(
        email=invitation_in.email,
        organization_id=organization_id,
        invited_by_id=invited_by_id,
        org_role=invitation_in.org_role,
        team_id=invitation_in.team_id,
        team_role=invitation_in.team_role,
        expires_in_days=invitation_in.expires_in_days,
    )

    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    return invitation, token


def get_invitation_by_id(
    session: Session,
    invitation_id: uuid.UUID,
) -> Invitation | None:
    """Get an invitation by ID.

    Args:
        session: Database session
        invitation_id: Invitation UUID

    Returns:
        Invitation if found, None otherwise
    """
    return session.get(Invitation, invitation_id)


def get_invitation_by_token(
    session: Session,
    token: str,
) -> Invitation | None:
    """Get an invitation by token.

    Args:
        session: Database session
        token: Raw token (will be hashed for lookup)

    Returns:
        Invitation if found, None otherwise
    """
    token_hash = Invitation.hash_token(token)
    statement = select(Invitation).where(Invitation.token_hash == token_hash)
    return session.exec(statement).first()


def get_organization_invitations(
    session: Session,
    organization_id: uuid.UUID,
    status_filter: InvitationStatus | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Invitation], int]:
    """Get all invitations for an organization.

    Args:
        session: Database session
        organization_id: Organization UUID
        status_filter: Optional status to filter by
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        Tuple of (list of Invitations, total count)
    """
    base_condition = Invitation.organization_id == organization_id
    if status_filter:
        base_condition = base_condition & (Invitation.status == status_filter)

    count_statement = select(func.count()).select_from(Invitation).where(base_condition)
    count = session.exec(count_statement).one()

    statement = (
        select(Invitation)
        .where(base_condition)
        .offset(skip)
        .limit(limit)
        .order_by(Invitation.created_at.desc())
    )
    invitations = list(session.exec(statement).all())

    return invitations, count


def get_pending_invitation_for_email(
    session: Session,
    organization_id: uuid.UUID,
    email: str,
) -> Invitation | None:
    """Get a pending invitation for an email in an organization.

    Args:
        session: Database session
        organization_id: Organization UUID
        email: Email address

    Returns:
        Invitation if found, None otherwise
    """
    statement = select(Invitation).where(
        Invitation.organization_id == organization_id,
        Invitation.email == email.lower(),
        Invitation.status == InvitationStatus.PENDING,
    )
    return session.exec(statement).first()


def accept_invitation(
    session: Session,
    invitation: Invitation,
) -> Invitation:
    """Mark an invitation as accepted.

    Args:
        session: Database session
        invitation: Invitation to accept

    Returns:
        Updated invitation
    """
    invitation.accept()
    session.add(invitation)
    session.commit()
    session.refresh(invitation)
    return invitation


def revoke_invitation(
    session: Session,
    invitation: Invitation,
) -> Invitation:
    """Revoke an invitation.

    Args:
        session: Database session
        invitation: Invitation to revoke

    Returns:
        Updated invitation
    """
    invitation.revoke()
    session.add(invitation)
    session.commit()
    session.refresh(invitation)
    return invitation


def delete_invitation(
    session: Session,
    invitation: Invitation,
) -> None:
    """Delete an invitation.

    Args:
        session: Database session
        invitation: Invitation to delete
    """
    session.delete(invitation)
    session.commit()


def expire_old_invitations(
    session: Session,
) -> int:
    """Mark all expired invitations as expired.

    This is typically run as a background job.

    Args:
        session: Database session

    Returns:
        Number of invitations marked as expired
    """
    now = datetime.now(UTC)
    statement = select(Invitation).where(
        Invitation.status == InvitationStatus.PENDING,
        Invitation.expires_at < now,
    )
    expired_invitations = session.exec(statement).all()

    count = 0
    for invitation in expired_invitations:
        invitation.status = InvitationStatus.EXPIRED
        session.add(invitation)
        count += 1

    session.commit()
    return count


def resend_invitation(
    session: Session,
    invitation: Invitation,
    expires_in_days: int = 7,
) -> tuple[Invitation, str]:
    """Resend an invitation by generating a new token.

    Creates a new invitation and deletes the old one.

    Args:
        session: Database session
        invitation: Existing invitation to resend
        expires_in_days: Number of days until expiration

    Returns:
        Tuple of (new Invitation, raw_token)
    """
    new_invitation, token = Invitation.create_with_token(
        email=invitation.email,
        organization_id=invitation.organization_id,
        invited_by_id=invitation.invited_by_id,
        org_role=invitation.org_role,
        team_id=invitation.team_id,
        team_role=invitation.team_role,
        expires_in_days=expires_in_days,
    )

    session.delete(invitation)
    session.add(new_invitation)
    session.commit()
    session.refresh(new_invitation)

    return new_invitation, token
