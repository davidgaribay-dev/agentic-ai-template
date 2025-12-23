from datetime import UTC, datetime, timedelta
from enum import Enum
import hashlib
import secrets
from typing import TYPE_CHECKING, Optional
import uuid

from sqlmodel import Field, Relationship, SQLModel

from backend.core.base_models import (
    CreatedAtMixin,
    PaginatedResponse,
    UUIDPrimaryKeyMixin,
)

if TYPE_CHECKING:
    from backend.auth.models import User
    from backend.organizations.models import Organization
    from backend.teams.models import Team


class InvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"


class InvitationBase(SQLModel):
    email: str = Field(max_length=255, index=True)


class Invitation(InvitationBase, UUIDPrimaryKeyMixin, CreatedAtMixin, table=True):
    """Invitation database model.

    Stores invitations for users to join organizations and optionally teams.
    Token is hashed with SHA-256 for security - only the hash is stored.
    """

    organization_id: uuid.UUID = Field(
        foreign_key="organization.id", nullable=False, ondelete="CASCADE"
    )
    team_id: uuid.UUID | None = Field(
        foreign_key="team.id", nullable=True, ondelete="CASCADE"
    )
    invited_by_id: uuid.UUID | None = Field(
        foreign_key="user.id", nullable=True, ondelete="SET NULL"
    )

    token_hash: str = Field(max_length=64, unique=True, index=True)

    # Role assignments (org role always required, team role optional)
    org_role: str = Field(default="member")  # OrgRole enum value
    team_role: str | None = Field(default=None)  # TeamRole enum value

    status: InvitationStatus = Field(default=InvitationStatus.PENDING)
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC) + timedelta(days=7)
    )
    accepted_at: datetime | None = Field(default=None)

    organization: "Organization" = Relationship(back_populates="invitations")
    team: Optional["Team"] = Relationship(back_populates="invitations")
    invited_by: Optional["User"] = Relationship(back_populates="sent_invitations")

    @staticmethod
    def generate_token() -> str:
        """Generate a secure random token."""
        return secrets.token_urlsafe(32)

    @staticmethod
    def hash_token(token: str) -> str:
        """Hash a token using SHA-256."""
        return hashlib.sha256(token.encode()).hexdigest()

    @classmethod
    def create_with_token(
        cls,
        email: str,
        organization_id: uuid.UUID,
        invited_by_id: uuid.UUID,
        org_role: str = "member",
        team_id: uuid.UUID | None = None,
        team_role: str | None = None,
        expires_in_days: int = 7,
    ) -> tuple["Invitation", str]:
        """Create an invitation with a new token.

        Returns:
            Tuple of (invitation, raw_token)
            The raw token should be sent to the user but NOT stored.
        """
        token = cls.generate_token()
        token_hash = cls.hash_token(token)

        invitation = cls(
            email=email,
            organization_id=organization_id,
            invited_by_id=invited_by_id,
            token_hash=token_hash,
            org_role=org_role,
            team_id=team_id,
            team_role=team_role,
            expires_at=datetime.now(UTC) + timedelta(days=expires_in_days),
        )

        return invitation, token

    def is_expired(self) -> bool:
        """Check if the invitation has expired."""
        expires_at = self.expires_at
        # Handle naive datetime from database (PostgreSQL stores without tz info)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        return datetime.now(UTC) > expires_at

    def is_valid(self) -> bool:
        """Check if the invitation is still valid (pending and not expired)."""
        return self.status == InvitationStatus.PENDING and not self.is_expired()

    def accept(self) -> None:
        """Mark the invitation as accepted."""
        self.status = InvitationStatus.ACCEPTED
        self.accepted_at = datetime.now(UTC)

    def revoke(self) -> None:
        """Revoke the invitation."""
        self.status = InvitationStatus.REVOKED


class InvitationCreate(SQLModel):
    email: str = Field(max_length=255)
    org_role: str = Field(default="member")
    team_id: uuid.UUID | None = None
    team_role: str | None = None
    expires_in_days: int = Field(default=7, ge=1, le=30)


class InvitationPublic(InvitationBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    team_id: uuid.UUID | None
    org_role: str
    team_role: str | None
    status: InvitationStatus
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None


class InvitationCreatedResponse(InvitationPublic):
    """Schema for invitation creation response - includes token for dev/self-serve flows.

    In production with email service, this would not include the token.
    For development and self-serve invite links, the token is returned once.
    """

    token: str


# InvitationsPublic is now PaginatedResponse[InvitationPublic]
InvitationsPublic = PaginatedResponse[InvitationPublic]


class InvitationAccept(SQLModel):
    token: str


class InvitationInfo(SQLModel):
    organization_name: str
    team_name: str | None
    org_role: str
    team_role: str | None
    email: str
    expires_at: datetime
    inviter_name: str | None


Invitation.model_rebuild()
