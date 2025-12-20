from enum import Enum

from backend.organizations.models import OrgRole
from backend.teams.models import TeamRole


class OrgPermission(str, Enum):
    # Organization management
    ORG_READ = "org:read"
    ORG_UPDATE = "org:update"
    ORG_DELETE = "org:delete"
    ORG_TRANSFER_OWNERSHIP = "org:transfer_ownership"

    # Member management
    MEMBERS_READ = "members:read"
    MEMBERS_INVITE = "members:invite"
    MEMBERS_UPDATE = "members:update"
    MEMBERS_REMOVE = "members:remove"

    # Team management
    TEAMS_CREATE = "teams:create"
    TEAMS_READ = "teams:read"
    TEAMS_UPDATE = "teams:update"
    TEAMS_DELETE = "teams:delete"

    # Invitation management
    INVITATIONS_READ = "invitations:read"
    INVITATIONS_CREATE = "invitations:create"
    INVITATIONS_REVOKE = "invitations:revoke"

    # Prompt management (org-level prompts)
    PROMPTS_READ = "prompts:read"
    PROMPTS_MANAGE = "prompts:manage"

    # Billing (future)
    BILLING_READ = "billing:read"
    BILLING_UPDATE = "billing:update"


class TeamPermission(str, Enum):
    # Team settings
    TEAM_READ = "team:read"
    TEAM_UPDATE = "team:update"
    TEAM_DELETE = "team:delete"

    # Team member management
    TEAM_MEMBERS_READ = "team_members:read"
    TEAM_MEMBERS_INVITE = "team_members:invite"
    TEAM_MEMBERS_UPDATE = "team_members:update"
    TEAM_MEMBERS_REMOVE = "team_members:remove"

    # Resources (conversations, items, etc.)
    RESOURCES_CREATE = "resources:create"
    RESOURCES_READ = "resources:read"
    RESOURCES_UPDATE = "resources:update"
    RESOURCES_DELETE = "resources:delete"

    # Own resources only
    OWN_RESOURCES_CREATE = "own_resources:create"
    OWN_RESOURCES_READ = "own_resources:read"
    OWN_RESOURCES_UPDATE = "own_resources:update"
    OWN_RESOURCES_DELETE = "own_resources:delete"

    # Prompt management (team-level prompts)
    PROMPTS_READ = "prompts:read"
    PROMPTS_MANAGE = "prompts:manage"


ORG_ROLE_PERMISSIONS: dict[OrgRole, set[OrgPermission]] = {
    OrgRole.OWNER: {
        # All permissions
        OrgPermission.ORG_READ,
        OrgPermission.ORG_UPDATE,
        OrgPermission.ORG_DELETE,
        OrgPermission.ORG_TRANSFER_OWNERSHIP,
        OrgPermission.MEMBERS_READ,
        OrgPermission.MEMBERS_INVITE,
        OrgPermission.MEMBERS_UPDATE,
        OrgPermission.MEMBERS_REMOVE,
        OrgPermission.TEAMS_CREATE,
        OrgPermission.TEAMS_READ,
        OrgPermission.TEAMS_UPDATE,
        OrgPermission.TEAMS_DELETE,
        OrgPermission.INVITATIONS_READ,
        OrgPermission.INVITATIONS_CREATE,
        OrgPermission.INVITATIONS_REVOKE,
        OrgPermission.PROMPTS_READ,
        OrgPermission.PROMPTS_MANAGE,
        OrgPermission.BILLING_READ,
        OrgPermission.BILLING_UPDATE,
    },
    OrgRole.ADMIN: {
        # All except org deletion and ownership transfer
        OrgPermission.ORG_READ,
        OrgPermission.ORG_UPDATE,
        OrgPermission.MEMBERS_READ,
        OrgPermission.MEMBERS_INVITE,
        OrgPermission.MEMBERS_UPDATE,
        OrgPermission.MEMBERS_REMOVE,
        OrgPermission.TEAMS_CREATE,
        OrgPermission.TEAMS_READ,
        OrgPermission.TEAMS_UPDATE,
        OrgPermission.TEAMS_DELETE,
        OrgPermission.INVITATIONS_READ,
        OrgPermission.INVITATIONS_CREATE,
        OrgPermission.INVITATIONS_REVOKE,
        OrgPermission.PROMPTS_READ,
        OrgPermission.PROMPTS_MANAGE,
        OrgPermission.BILLING_READ,
    },
    OrgRole.MEMBER: {
        # Basic access - cannot view org settings or member list
        OrgPermission.TEAMS_CREATE,
        OrgPermission.TEAMS_READ,
        OrgPermission.PROMPTS_READ,
    },
}


TEAM_ROLE_PERMISSIONS: dict[TeamRole, set[TeamPermission]] = {
    TeamRole.ADMIN: {
        # All team permissions
        TeamPermission.TEAM_READ,
        TeamPermission.TEAM_UPDATE,
        TeamPermission.TEAM_DELETE,
        TeamPermission.TEAM_MEMBERS_READ,
        TeamPermission.TEAM_MEMBERS_INVITE,
        TeamPermission.TEAM_MEMBERS_UPDATE,
        TeamPermission.TEAM_MEMBERS_REMOVE,
        TeamPermission.RESOURCES_CREATE,
        TeamPermission.RESOURCES_READ,
        TeamPermission.RESOURCES_UPDATE,
        TeamPermission.RESOURCES_DELETE,
        TeamPermission.OWN_RESOURCES_CREATE,
        TeamPermission.OWN_RESOURCES_READ,
        TeamPermission.OWN_RESOURCES_UPDATE,
        TeamPermission.OWN_RESOURCES_DELETE,
        TeamPermission.PROMPTS_READ,
        TeamPermission.PROMPTS_MANAGE,
    },
    TeamRole.MEMBER: {
        # Can create and manage own resources, read team resources
        TeamPermission.TEAM_READ,
        TeamPermission.TEAM_MEMBERS_READ,
        TeamPermission.RESOURCES_READ,
        TeamPermission.OWN_RESOURCES_CREATE,
        TeamPermission.OWN_RESOURCES_READ,
        TeamPermission.OWN_RESOURCES_UPDATE,
        TeamPermission.OWN_RESOURCES_DELETE,
        TeamPermission.PROMPTS_READ,
    },
    TeamRole.VIEWER: {
        # Read-only access
        TeamPermission.TEAM_READ,
        TeamPermission.TEAM_MEMBERS_READ,
        TeamPermission.RESOURCES_READ,
        TeamPermission.OWN_RESOURCES_READ,
        TeamPermission.PROMPTS_READ,
    },
}


ORG_ROLE_HIERARCHY: dict[OrgRole, int] = {
    OrgRole.OWNER: 100,
    OrgRole.ADMIN: 50,
    OrgRole.MEMBER: 10,
}

TEAM_ROLE_HIERARCHY: dict[TeamRole, int] = {
    TeamRole.ADMIN: 100,
    TeamRole.MEMBER: 50,
    TeamRole.VIEWER: 10,
}


def has_org_permission(role: OrgRole, permission: OrgPermission) -> bool:
    """Check if an organization role has a specific permission.

    Args:
        role: The user's organization role
        permission: The permission to check

    Returns:
        True if the role has the permission
    """
    return permission in ORG_ROLE_PERMISSIONS.get(role, set())


def has_team_permission(role: TeamRole, permission: TeamPermission) -> bool:
    """Check if a team role has a specific permission.

    Args:
        role: The user's team role
        permission: The permission to check

    Returns:
        True if the role has the permission
    """
    return permission in TEAM_ROLE_PERMISSIONS.get(role, set())


def can_assign_org_role(assigner_role: OrgRole, target_role: OrgRole) -> bool:
    """Check if a user can assign a specific organization role.

    Users can only assign roles lower than or equal to their own,
    except OWNER which requires explicit transfer.

    Args:
        assigner_role: The role of the user doing the assignment
        target_role: The role being assigned

    Returns:
        True if the assignment is allowed
    """
    # Only owners can assign owner role (via transfer)
    if target_role == OrgRole.OWNER:
        return assigner_role == OrgRole.OWNER

    # Otherwise, can assign roles at or below own level
    return ORG_ROLE_HIERARCHY.get(assigner_role, 0) >= ORG_ROLE_HIERARCHY.get(
        target_role, 0
    )


def can_assign_team_role(
    assigner_org_role: OrgRole,
    assigner_team_role: TeamRole | None,
    target_role: TeamRole,
) -> bool:
    """Check if a user can assign a specific team role.

    Org admins/owners can assign any team role.
    Team admins can assign roles at or below their level.

    Args:
        assigner_org_role: The user's organization role
        assigner_team_role: The user's team role (if any)
        target_role: The team role being assigned

    Returns:
        True if the assignment is allowed
    """
    # Org owners and admins can assign any team role
    if assigner_org_role in (OrgRole.OWNER, OrgRole.ADMIN):
        return True

    # Team admins can assign roles at or below their level
    if assigner_team_role is None:
        return False

    return TEAM_ROLE_HIERARCHY.get(assigner_team_role, 0) >= TEAM_ROLE_HIERARCHY.get(
        target_role, 0
    )


def get_org_permissions(role: OrgRole) -> set[OrgPermission]:
    """Get all permissions for an organization role.

    Args:
        role: The organization role

    Returns:
        Set of permissions for the role
    """
    return ORG_ROLE_PERMISSIONS.get(role, set()).copy()


def get_team_permissions(role: TeamRole) -> set[TeamPermission]:
    """Get all permissions for a team role.

    Args:
        role: The team role

    Returns:
        Set of permissions for the role
    """
    return TEAM_ROLE_PERMISSIONS.get(role, set()).copy()
