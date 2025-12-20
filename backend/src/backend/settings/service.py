import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from backend.settings.models import (
    EffectiveSettings,
    OrganizationSettings,
    OrganizationSettingsUpdate,
    TeamSettings,
    TeamSettingsUpdate,
    UserSettings,
    UserSettingsUpdate,
)


def get_or_create_org_settings(
    session: Session, organization_id: uuid.UUID
) -> OrganizationSettings:
    statement = select(OrganizationSettings).where(
        OrganizationSettings.organization_id == organization_id
    )
    settings = session.exec(statement).first()

    if not settings:
        settings = OrganizationSettings(
            organization_id=organization_id,
            chat_enabled=True,
            chat_panel_enabled=True,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_org_settings(
    session: Session, organization_id: uuid.UUID, data: OrganizationSettingsUpdate
) -> OrganizationSettings:
    settings = get_or_create_org_settings(session, organization_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_team_settings(
    session: Session, team_id: uuid.UUID
) -> TeamSettings:
    statement = select(TeamSettings).where(TeamSettings.team_id == team_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = TeamSettings(
            team_id=team_id,
            chat_enabled=True,
            chat_panel_enabled=True,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_team_settings(
    session: Session, team_id: uuid.UUID, data: TeamSettingsUpdate
) -> TeamSettings:
    settings = get_or_create_team_settings(session, team_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_user_settings(session: Session, user_id: uuid.UUID) -> UserSettings:
    statement = select(UserSettings).where(UserSettings.user_id == user_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = UserSettings(
            user_id=user_id,
            chat_enabled=True,
            chat_panel_enabled=True,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_user_settings(
    session: Session, user_id: uuid.UUID, data: UserSettingsUpdate
) -> UserSettings:
    settings = get_or_create_user_settings(session, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_effective_settings(
    session: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> EffectiveSettings:
    """Compute effective settings by applying hierarchy: Org > Team > User.

    The hierarchy works as follows:
    - If org disables a feature, it's disabled regardless of team/user settings
    - If team disables a feature (and org allows), it's disabled for team members
    - User settings only apply if both org and team allow the feature
    """
    org_settings = None
    team_settings = None
    user_settings = get_or_create_user_settings(session, user_id)

    if organization_id:
        org_settings = get_or_create_org_settings(session, organization_id)
    if team_id:
        team_settings = get_or_create_team_settings(session, team_id)

    # Chat enabled (sidebar + standalone chat page)
    chat_enabled = True
    chat_disabled_by = None

    if org_settings and not org_settings.chat_enabled:
        chat_enabled = False
        chat_disabled_by = "org"
    elif team_settings and not team_settings.chat_enabled:
        chat_enabled = False
        chat_disabled_by = "team"
    elif not user_settings.chat_enabled:
        chat_enabled = False

    # Chat panel enabled
    chat_panel_enabled = True
    chat_panel_disabled_by = None

    if org_settings and not org_settings.chat_panel_enabled:
        chat_panel_enabled = False
        chat_panel_disabled_by = "org"
    elif team_settings and not team_settings.chat_panel_enabled:
        chat_panel_enabled = False
        chat_panel_disabled_by = "team"
    elif not user_settings.chat_panel_enabled:
        chat_panel_enabled = False

    return EffectiveSettings(
        chat_enabled=chat_enabled,
        chat_disabled_by=chat_disabled_by,
        chat_panel_enabled=chat_panel_enabled,
        chat_panel_disabled_by=chat_panel_disabled_by,
    )
