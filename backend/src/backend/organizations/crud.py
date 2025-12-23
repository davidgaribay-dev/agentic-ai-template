from datetime import UTC, datetime
import re
import secrets
import uuid

from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from backend.auth.models import User
from backend.organizations.models import (
    Organization,
    OrganizationCreate,
    OrganizationMember,
    OrganizationUpdate,
    OrgRole,
)


def generate_slug(name: str) -> str:
    """Generate a URL-friendly slug from a name.

    Args:
        name: The name to convert to a slug

    Returns:
        URL-friendly slug
    """
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower())
    slug = slug.strip("-")
    return slug[:100]


def make_slug_unique(session: Session, base_slug: str, max_attempts: int = 100) -> str:
    """Ensure a slug is unique by appending a random suffix if necessary.

    Uses a random suffix approach to reduce collision probability and avoid
    unbounded loops. Falls back to UUID suffix if max attempts exceeded.

    Args:
        session: Database session
        base_slug: The base slug to make unique
        max_attempts: Maximum number of attempts before using UUID suffix

    Returns:
        A unique slug
    """
    slug = base_slug

    statement = select(Organization).where(Organization.slug == slug)
    existing = session.exec(statement).first()
    if not existing:
        return slug

    for counter in range(1, max_attempts + 1):
        slug = f"{base_slug}-{counter}"
        statement = select(Organization).where(Organization.slug == slug)
        existing = session.exec(statement).first()
        if not existing:
            return slug

    random_suffix = secrets.token_hex(4)
    return f"{base_slug}-{random_suffix}"


def create_organization(
    session: Session,
    organization_in: OrganizationCreate,
    owner: User,
) -> tuple[Organization, OrganizationMember]:
    """Create a new organization with the given user as owner.

    Args:
        session: Database session
        organization_in: Organization creation data
        owner: User who will be the owner

    Returns:
        Tuple of (Organization, OrganizationMember for owner)
    """
    slug = organization_in.slug
    if not slug:
        slug = generate_slug(organization_in.name)
    slug = make_slug_unique(session, slug)

    organization = Organization(
        name=organization_in.name,
        slug=slug,
        description=organization_in.description,
    )
    session.add(organization)
    session.flush()

    owner_membership = OrganizationMember(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
    )
    session.add(owner_membership)
    session.commit()
    session.refresh(organization)
    session.refresh(owner_membership)

    return organization, owner_membership


def get_organization_by_id(
    session: Session,
    organization_id: uuid.UUID,
) -> Organization | None:
    """Get an organization by ID.

    Args:
        session: Database session
        organization_id: Organization UUID

    Returns:
        Organization if found, None otherwise
    """
    return session.get(Organization, organization_id)


def get_organization_by_slug(
    session: Session,
    slug: str,
) -> Organization | None:
    """Get an organization by slug.

    Args:
        session: Database session
        slug: Organization slug

    Returns:
        Organization if found, None otherwise
    """
    statement = select(Organization).where(Organization.slug == slug)
    return session.exec(statement).first()


def get_user_organizations(
    session: Session,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Organization], int]:
    """Get all organizations a user is a member of.

    Args:
        session: Database session
        user_id: User UUID
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        Tuple of (list of Organizations, total count)
    """
    count_statement = (
        select(func.count())
        .select_from(OrganizationMember)
        .where(OrganizationMember.user_id == user_id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)  # type: ignore[arg-type]
        .where(OrganizationMember.user_id == user_id)
        .offset(skip)
        .limit(limit)
        .order_by(Organization.name)
    )
    organizations = session.exec(statement).all()

    return list(organizations), count


def update_organization(
    session: Session,
    organization: Organization,
    organization_in: OrganizationUpdate,
) -> Organization:
    """Update an organization.

    Args:
        session: Database session
        organization: Organization to update
        organization_in: Update data

    Returns:
        Updated organization
    """
    update_data = organization_in.model_dump(exclude_unset=True)

    if update_data.get("slug"):
        new_slug = update_data["slug"]
        if new_slug != organization.slug:
            update_data["slug"] = make_slug_unique(session, new_slug)

    for field, value in update_data.items():
        setattr(organization, field, value)

    organization.updated_at = datetime.now(UTC)
    session.add(organization)
    session.commit()
    session.refresh(organization)

    return organization


def delete_organization(
    session: Session,
    organization: Organization,
) -> None:
    """Delete an organization and all related data.

    Args:
        session: Database session
        organization: Organization to delete
    """
    session.delete(organization)
    session.commit()


def get_org_membership(
    session: Session,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> OrganizationMember | None:
    """Get a user's membership in an organization.

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


def get_org_member_by_id(
    session: Session,
    member_id: uuid.UUID,
) -> OrganizationMember | None:
    """Get an organization member by ID.

    Args:
        session: Database session
        member_id: OrganizationMember UUID

    Returns:
        OrganizationMember if found, None otherwise
    """
    return session.get(OrganizationMember, member_id)


def get_organization_members(
    session: Session,
    organization_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[OrganizationMember], int]:
    """Get all members of an organization with user data eagerly loaded.

    Args:
        session: Database session
        organization_id: Organization UUID
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        Tuple of (list of OrganizationMembers with user relationship loaded, total count)
    """
    count_statement = (
        select(func.count())
        .select_from(OrganizationMember)
        .where(OrganizationMember.organization_id == organization_id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(OrganizationMember)
        .where(OrganizationMember.organization_id == organization_id)
        .options(selectinload(OrganizationMember.user))  # type: ignore[arg-type]
        .offset(skip)
        .limit(limit)
        .order_by(OrganizationMember.created_at)  # type: ignore[arg-type]
    )
    members = session.exec(statement).all()

    return list(members), count


def add_org_member(
    session: Session,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    role: OrgRole = OrgRole.MEMBER,
) -> OrganizationMember:
    """Add a user as a member of an organization.

    Args:
        session: Database session
        organization_id: Organization UUID
        user_id: User UUID
        role: Role to assign

    Returns:
        Created OrganizationMember
    """
    member = OrganizationMember(
        organization_id=organization_id,
        user_id=user_id,
        role=role,
    )
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def update_org_member_role(
    session: Session,
    member: OrganizationMember,
    new_role: OrgRole,
) -> OrganizationMember:
    """Update an organization member's role.

    Args:
        session: Database session
        member: OrganizationMember to update
        new_role: New role to assign

    Returns:
        Updated OrganizationMember
    """
    member.role = new_role
    member.updated_at = datetime.now(UTC)
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def remove_org_member(
    session: Session,
    member: OrganizationMember,
) -> None:
    """Remove a member from an organization.

    Args:
        session: Database session
        member: OrganizationMember to remove
    """
    session.delete(member)
    session.commit()


def transfer_ownership(
    session: Session,
    organization_id: uuid.UUID,
    current_owner_id: uuid.UUID,
    new_owner_id: uuid.UUID,
) -> tuple[OrganizationMember, OrganizationMember]:
    """Transfer organization ownership to another member.

    Args:
        session: Database session
        organization_id: Organization UUID
        current_owner_id: Current owner's user UUID
        new_owner_id: New owner's user UUID

    Returns:
        Tuple of (old owner membership, new owner membership)

    Raises:
        ValueError: If new owner is not a member
    """
    current_owner_membership = get_org_membership(
        session, organization_id, current_owner_id
    )
    if not current_owner_membership:
        raise ValueError("Current owner membership not found")

    new_owner_membership = get_org_membership(session, organization_id, new_owner_id)
    if not new_owner_membership:
        raise ValueError("New owner must be an existing member of the organization")

    now = datetime.now(UTC)
    current_owner_membership.role = OrgRole.ADMIN
    current_owner_membership.updated_at = now
    new_owner_membership.role = OrgRole.OWNER
    new_owner_membership.updated_at = now

    session.add(current_owner_membership)
    session.add(new_owner_membership)
    session.commit()
    session.refresh(current_owner_membership)
    session.refresh(new_owner_membership)

    return current_owner_membership, new_owner_membership


def get_org_owner(
    session: Session,
    organization_id: uuid.UUID,
) -> OrganizationMember | None:
    """Get the owner of an organization.

    Args:
        session: Database session
        organization_id: Organization UUID

    Returns:
        OrganizationMember with owner role, or None
    """
    statement = select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.role == OrgRole.OWNER,
    )
    return session.exec(statement).first()
