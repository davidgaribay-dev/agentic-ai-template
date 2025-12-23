from collections.abc import Callable
from typing import Annotated
import uuid

from fastapi import Depends, HTTPException, Path, status
from sqlmodel import select

from backend.auth.deps import CurrentUser, SessionDep
from backend.auth.models import User
from backend.organizations.models import Organization, OrganizationMember, OrgRole
from backend.rbac.permissions import (
    OrgPermission,
    TeamPermission,
    has_org_permission,
    has_team_permission,
)
from backend.teams.models import Team, TeamMember, TeamRole


class OrganizationContext:
    """Request context containing organization and membership info."""

    def __init__(
        self,
        organization: Organization,
        membership: OrganizationMember,
        user: User,
    ):
        self.organization = organization
        self.membership = membership
        self.user = user

    @property
    def org_id(self) -> uuid.UUID:
        return self.organization.id

    @property
    def role(self) -> OrgRole:
        return self.membership.role

    def has_permission(self, permission: OrgPermission) -> bool:
        """Check if user has a specific organization permission."""
        return has_org_permission(self.role, permission)

    def require_permission(self, permission: OrgPermission) -> None:
        """Require a specific permission, raising HTTPException if not met."""
        if not self.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission.value}",
            )


class TeamContext:
    """Request context containing team and membership info."""

    def __init__(
        self,
        team: Team,
        team_membership: TeamMember,
        org_context: OrganizationContext,
    ):
        self.team = team
        self.team_membership = team_membership
        self.org_context = org_context

    @property
    def team_id(self) -> uuid.UUID:
        return self.team.id

    @property
    def org_id(self) -> uuid.UUID:
        return self.org_context.org_id

    @property
    def role(self) -> TeamRole:
        return self.team_membership.role

    @property
    def user(self) -> User:
        return self.org_context.user

    def has_permission(self, permission: TeamPermission) -> bool:
        """Check if user has a specific team permission."""
        return has_team_permission(self.role, permission)

    def require_permission(self, permission: TeamPermission) -> None:
        """Require a specific permission, raising HTTPException if not met."""
        if not self.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission.value}",
            )


def get_organization(
    session: SessionDep,
    organization_id: Annotated[uuid.UUID, Path(description="Organization ID")],
) -> Organization:
    """Get organization by ID from path parameter.

    Args:
        session: Database session
        organization_id: Organization UUID from path

    Returns:
        Organization if found

    Raises:
        HTTPException: If organization not found
    """
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return organization


def get_organization_by_slug(
    session: SessionDep,
    org_slug: Annotated[str, Path(description="Organization slug")],
) -> Organization:
    """Get organization by slug from path parameter.

    Args:
        session: Database session
        org_slug: Organization slug from path

    Returns:
        Organization if found

    Raises:
        HTTPException: If organization not found
    """
    statement = select(Organization).where(Organization.slug == org_slug)
    organization = session.exec(statement).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return organization


def get_org_membership(
    session: SessionDep,
    current_user: CurrentUser,
    organization: Annotated[Organization, Depends(get_organization)],
) -> OrganizationMember:
    """Get current user's membership in the organization.

    Args:
        session: Database session
        current_user: Authenticated user
        organization: Organization from path

    Returns:
        OrganizationMember if user is a member

    Raises:
        HTTPException: If user is not a member
    """
    statement = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == current_user.id,
    )
    membership = session.exec(statement).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return membership


def get_org_context(
    current_user: CurrentUser,
    organization: Annotated[Organization, Depends(get_organization)],
    membership: Annotated[OrganizationMember, Depends(get_org_membership)],
) -> OrganizationContext:
    """Get organization context with user's membership.

    This is the main dependency for organization-scoped routes.

    Args:
        current_user: Authenticated user
        organization: Organization from path
        membership: User's organization membership

    Returns:
        OrganizationContext with org, membership, and user
    """
    return OrganizationContext(
        organization=organization,
        membership=membership,
        user=current_user,
    )


# Type alias for organization context dependency
OrgContextDep = Annotated[OrganizationContext, Depends(get_org_context)]


def get_team(
    session: SessionDep,
    team_id: Annotated[uuid.UUID, Path(description="Team ID")],
    org_context: OrgContextDep,
) -> Team:
    """Get team by ID, validating it belongs to the organization.

    Args:
        session: Database session
        team_id: Team UUID from path
        org_context: Organization context

    Returns:
        Team if found and belongs to org

    Raises:
        HTTPException: If team not found or doesn't belong to org
    """
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    if team.organization_id != org_context.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found in this organization",
        )

    return team


def get_team_by_slug(
    session: SessionDep,
    team_slug: Annotated[str, Path(description="Team slug")],
    org_context: OrgContextDep,
) -> Team:
    """Get team by slug within the organization.

    Args:
        session: Database session
        team_slug: Team slug from path
        org_context: Organization context

    Returns:
        Team if found

    Raises:
        HTTPException: If team not found
    """
    statement = select(Team).where(
        Team.organization_id == org_context.org_id,
        Team.slug == team_slug,
    )
    team = session.exec(statement).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )
    return team


def get_team_membership(
    session: SessionDep,
    org_context: OrgContextDep,
    team: Annotated[Team, Depends(get_team)],
) -> TeamMember:
    """Get current user's membership in the team.

    Args:
        session: Database session
        org_context: Organization context (contains org membership)
        team: Team from path

    Returns:
        TeamMember if user is a member

    Raises:
        HTTPException: If user is not a team member
    """
    statement = select(TeamMember).where(
        TeamMember.team_id == team.id,
        TeamMember.org_member_id == org_context.membership.id,
    )
    team_membership = session.exec(statement).first()

    if not team_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this team",
        )
    return team_membership


def get_team_context(
    org_context: OrgContextDep,
    team: Annotated[Team, Depends(get_team)],
    team_membership: Annotated[TeamMember, Depends(get_team_membership)],
) -> TeamContext:
    """Get team context with user's team membership.

    This is the main dependency for team-scoped routes.

    Args:
        org_context: Organization context
        team: Team from path
        team_membership: User's team membership

    Returns:
        TeamContext with team, membership, and org context
    """
    return TeamContext(
        team=team,
        team_membership=team_membership,
        org_context=org_context,
    )


# Type alias for team context dependency
TeamContextDep = Annotated[TeamContext, Depends(get_team_context)]


def require_org_permission(
    permission: OrgPermission,
) -> Callable[[OrgContextDep], None]:
    """Create a dependency that requires a specific organization permission.

    Usage:
        @router.post("/", dependencies=[Depends(require_org_permission(OrgPermission.TEAMS_CREATE))])
        def create_team(org_context: OrgContextDep):
            ...
    """

    def dependency(org_context: OrgContextDep) -> None:
        org_context.require_permission(permission)

    return dependency


def require_team_permission(
    permission: TeamPermission,
) -> Callable[[TeamContextDep], None]:
    """Create a dependency that requires a specific team permission.

    Usage:
        @router.post("/", dependencies=[Depends(require_team_permission(TeamPermission.RESOURCES_CREATE))])
        def create_resource(team_context: TeamContextDep):
            ...
    """

    def dependency(team_context: TeamContextDep) -> None:
        team_context.require_permission(permission)

    return dependency


def require_org_owner(org_context: OrgContextDep) -> None:
    """Require the user to be an organization owner."""
    if org_context.role != OrgRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization owners can perform this action",
        )


def require_org_admin(org_context: OrgContextDep) -> None:
    """Require the user to be an organization admin or owner."""
    if org_context.role not in (OrgRole.OWNER, OrgRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can perform this action",
        )


def require_team_admin(team_context: TeamContextDep) -> None:
    """Require the user to be a team admin (or org admin/owner)."""
    # Org admins/owners always have team admin privileges
    if team_context.org_context.role in (OrgRole.OWNER, OrgRole.ADMIN):
        return

    if team_context.role != TeamRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team admins can perform this action",
        )


# Type aliases for role-based dependencies
RequireOrgOwnerDep = Annotated[None, Depends(require_org_owner)]
RequireOrgAdminDep = Annotated[None, Depends(require_org_admin)]
RequireTeamAdminDep = Annotated[None, Depends(require_team_admin)]


def get_current_platform_admin(current_user: CurrentUser) -> User:
    """Require the current user to be a platform admin.

    Platform admins have access to all organizations and resources.
    This is for platform-wide administration, not organization-level.

    Args:
        current_user: Authenticated user

    Returns:
        User if they are a platform admin

    Raises:
        HTTPException: If user is not a platform admin
    """
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


# Type alias for platform admin dependency
PlatformAdminDep = Annotated[User, Depends(get_current_platform_admin)]
