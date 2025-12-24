"""Script to create initial data (first platform admin with organization)."""

import logging

from sqlmodel import Session

from backend.auth import UserCreate, create_user, get_user_by_email
from backend.conversations.models import Conversation  # noqa: F401
from backend.core.config import settings
from backend.core.db import engine
from backend.invitations.models import Invitation  # noqa: F401

# Import all models to ensure relationships are properly configured
from backend.items.models import Item  # noqa: F401
from backend.organizations import crud as org_crud
from backend.organizations.models import (  # noqa: F401
    Organization,
    OrganizationCreate,
    OrganizationMember,
)
from backend.rag_settings.models import UserRAGSettings  # noqa: F401
from backend.settings.models import UserSettings  # noqa: F401
from backend.teams import crud as team_crud
from backend.teams.models import Team, TeamCreate, TeamMember  # noqa: F401
from backend.theme_settings.models import UserThemeSettings  # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init() -> None:
    """Create first platform admin with their organization if it doesn't exist."""
    with Session(engine) as session:
        user = get_user_by_email(session=session, email=settings.FIRST_SUPERUSER_EMAIL)
        if not user:
            user_in = UserCreate(
                email=settings.FIRST_SUPERUSER_EMAIL,
                password=settings.FIRST_SUPERUSER_PASSWORD,
                is_platform_admin=True,
            )
            user = create_user(session=session, user_create=user_in)
            logger.info(f"Created platform admin: {user.email}")

            org_create = OrganizationCreate(
                name="Platform Admin Organization",
                description="Default organization for the platform administrator",
            )
            organization, org_membership = org_crud.create_organization(
                session=session,
                organization_in=org_create,
                owner=user,
            )
            logger.info(f"Created organization: {organization.name}")

            team_create = TeamCreate(
                name="Admin Team",
                description="Default team for platform administration",
            )
            team, _team_membership = team_crud.create_team(
                session=session,
                organization_id=organization.id,
                team_in=team_create,
                created_by_id=user.id,
                creator_org_member_id=org_membership.id,
            )
            logger.info(f"Created team: {team.name}")
        else:
            logger.info(f"Platform admin already exists: {user.email}")


def main() -> None:
    logger.info("Creating initial data")
    init()
    logger.info("Initial data created")


if __name__ == "__main__":
    main()
