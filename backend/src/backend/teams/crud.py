import re
import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select, func

from backend.auth.models import User
from backend.organizations.models import OrganizationMember
from backend.teams.models import (
    Team,
    TeamCreate,
    TeamMember,
    TeamMemberWithUser,
    TeamRole,
    TeamUpdate,
)


def generate_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower())
    slug = slug.strip("-")
    return slug[:100]


def make_slug_unique_in_org(
    session: Session,
    organization_id: uuid.UUID,
    base_slug: str,
    max_attempts: int = 100,
) -> str:
    import secrets

    slug = base_slug

    statement = select(Team).where(
        Team.organization_id == organization_id,
        Team.slug == slug,
    )
    existing = session.exec(statement).first()
    if not existing:
        return slug

    for counter in range(1, max_attempts + 1):
        slug = f"{base_slug}-{counter}"
        statement = select(Team).where(
            Team.organization_id == organization_id,
            Team.slug == slug,
        )
        existing = session.exec(statement).first()
        if not existing:
            return slug

    random_suffix = secrets.token_hex(4)
    return f"{base_slug}-{random_suffix}"


def create_team(
    session: Session,
    organization_id: uuid.UUID,
    team_in: TeamCreate,
    created_by_id: uuid.UUID,
    creator_org_member_id: uuid.UUID,
) -> tuple[Team, TeamMember]:
    """Create a new team with the creator as admin.

    Args:
        session: Database session
        organization_id: Organization UUID
        team_in: Team creation data
        created_by_id: User UUID who is creating the team
        creator_org_member_id: OrganizationMember UUID for the creator

    Returns:
        Tuple of (Team, TeamMember for creator)
    """
    slug = team_in.slug
    if not slug:
        slug = generate_slug(team_in.name)
    slug = make_slug_unique_in_org(session, organization_id, slug)

    team = Team(
        name=team_in.name,
        slug=slug,
        description=team_in.description,
        organization_id=organization_id,
        created_by_id=created_by_id,
    )
    session.add(team)
    session.flush()

    creator_membership = TeamMember(
        team_id=team.id,
        org_member_id=creator_org_member_id,
        role=TeamRole.ADMIN,
    )
    session.add(creator_membership)
    session.commit()
    session.refresh(team)
    session.refresh(creator_membership)

    return team, creator_membership


def get_team_by_id(
    session: Session,
    team_id: uuid.UUID,
) -> Team | None:
    """Get a team by ID.

    Args:
        session: Database session
        team_id: Team UUID

    Returns:
        Team if found, None otherwise
    """
    return session.get(Team, team_id)


def get_team_by_slug(
    session: Session,
    organization_id: uuid.UUID,
    slug: str,
) -> Team | None:
    """Get a team by slug within an organization.

    Args:
        session: Database session
        organization_id: Organization UUID
        slug: Team slug

    Returns:
        Team if found, None otherwise
    """
    statement = select(Team).where(
        Team.organization_id == organization_id,
        Team.slug == slug,
    )
    return session.exec(statement).first()


def get_organization_teams(
    session: Session,
    organization_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Team], int]:
    """Get all teams in an organization.

    Args:
        session: Database session
        organization_id: Organization UUID
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        Tuple of (list of Teams, total count)
    """
    count_statement = (
        select(func.count())
        .select_from(Team)
        .where(Team.organization_id == organization_id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(Team)
        .where(Team.organization_id == organization_id)
        .offset(skip)
        .limit(limit)
        .order_by(Team.name)
    )
    teams = session.exec(statement).all()

    return list(teams), count


def get_user_teams_in_org(
    session: Session,
    organization_id: uuid.UUID,
    org_member_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Team], int]:
    """Get all teams a user is a member of within an organization.

    Args:
        session: Database session
        organization_id: Organization UUID
        org_member_id: OrganizationMember UUID
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        Tuple of (list of Teams, total count)
    """
    count_statement = (
        select(func.count())
        .select_from(TeamMember)
        .join(Team, TeamMember.team_id == Team.id)
        .where(
            Team.organization_id == organization_id,
            TeamMember.org_member_id == org_member_id,
        )
    )
    count = session.exec(count_statement).one()

    statement = (
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(
            Team.organization_id == organization_id,
            TeamMember.org_member_id == org_member_id,
        )
        .offset(skip)
        .limit(limit)
        .order_by(Team.name)
    )
    teams = session.exec(statement).all()

    return list(teams), count


def update_team(
    session: Session,
    team: Team,
    team_in: TeamUpdate,
) -> Team:
    """Update a team.

    Args:
        session: Database session
        team: Team to update
        team_in: Update data

    Returns:
        Updated team
    """
    update_data = team_in.model_dump(exclude_unset=True)

    if "slug" in update_data and update_data["slug"]:
        new_slug = update_data["slug"]
        if new_slug != team.slug:
            update_data["slug"] = make_slug_unique_in_org(
                session, team.organization_id, new_slug
            )

    for field, value in update_data.items():
        setattr(team, field, value)

    team.updated_at = datetime.now(UTC)
    session.add(team)
    session.commit()
    session.refresh(team)

    return team


def delete_team(
    session: Session,
    team: Team,
) -> None:
    """Delete a team and all related data.

    Args:
        session: Database session
        team: Team to delete
    """
    session.delete(team)
    session.commit()


def get_team_membership(
    session: Session,
    team_id: uuid.UUID,
    org_member_id: uuid.UUID,
) -> TeamMember | None:
    """Get a user's membership in a team.

    Args:
        session: Database session
        team_id: Team UUID
        org_member_id: OrganizationMember UUID

    Returns:
        TeamMember if found, None otherwise
    """
    statement = select(TeamMember).where(
        TeamMember.team_id == team_id,
        TeamMember.org_member_id == org_member_id,
    )
    return session.exec(statement).first()


def get_team_member_by_id(
    session: Session,
    member_id: uuid.UUID,
) -> TeamMember | None:
    """Get a team member by ID.

    Args:
        session: Database session
        member_id: TeamMember UUID

    Returns:
        TeamMember if found, None otherwise
    """
    return session.get(TeamMember, member_id)


def get_team_members(
    session: Session,
    team_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[TeamMemberWithUser], int]:
    """Get all members of a team with user details.

    Args:
        session: Database session
        team_id: Team UUID
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        Tuple of (list of TeamMemberWithUser, total count)
    """
    count_statement = (
        select(func.count())
        .select_from(TeamMember)
        .where(TeamMember.team_id == team_id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(TeamMember, OrganizationMember, User)
        .join(OrganizationMember, TeamMember.org_member_id == OrganizationMember.id)
        .join(User, OrganizationMember.user_id == User.id)
        .where(TeamMember.team_id == team_id)
        .offset(skip)
        .limit(limit)
        .order_by(TeamMember.created_at)
    )
    results = list(session.exec(statement).all())

    members_with_user = []
    for team_member, org_member, user in results:
        members_with_user.append(
            TeamMemberWithUser(
                id=team_member.id,
                team_id=team_member.team_id,
                org_member_id=team_member.org_member_id,
                role=team_member.role,
                created_at=team_member.created_at,
                updated_at=team_member.updated_at,
                user_id=user.id,
                user_email=user.email,
                user_full_name=user.full_name,
                user_profile_image_url=user.profile_image_url,
                org_role=org_member.role.value,
            )
        )

    return members_with_user, count


def add_team_member(
    session: Session,
    team_id: uuid.UUID,
    org_member_id: uuid.UUID,
    role: TeamRole = TeamRole.MEMBER,
) -> TeamMember:
    """Add an organization member to a team.

    Args:
        session: Database session
        team_id: Team UUID
        org_member_id: OrganizationMember UUID
        role: Role to assign

    Returns:
        Created TeamMember
    """
    member = TeamMember(
        team_id=team_id,
        org_member_id=org_member_id,
        role=role,
    )
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def update_team_member_role(
    session: Session,
    member: TeamMember,
    new_role: TeamRole,
) -> TeamMember:
    """Update a team member's role.

    Args:
        session: Database session
        member: TeamMember to update
        new_role: New role to assign

    Returns:
        Updated TeamMember
    """
    member.role = new_role
    member.updated_at = datetime.now(UTC)
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def remove_team_member(
    session: Session,
    member: TeamMember,
) -> None:
    """Remove a member from a team.

    Args:
        session: Database session
        member: TeamMember to remove
    """
    session.delete(member)
    session.commit()


def get_org_member_by_user_in_org(
    session: Session,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> OrganizationMember | None:
    """Get an organization member by user ID within an organization.

    Helper function to find org member when adding users to teams.

    Args:
        session: Database session
        organization_id: Organization UUID
        user_id: User UUID

    Returns:
        OrganizationMember if found, None otherwise
    """
    statement = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == user_id,
    )
    return session.exec(statement).first()
