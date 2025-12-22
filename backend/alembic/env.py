from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlmodel import SQLModel, create_engine

from backend.auth.models import User  # noqa: F401 - Import models for autogenerate
from backend.conversations.models import Conversation  # noqa: F401 - Import models for autogenerate
from backend.items.models import Item  # noqa: F401 - Import models for autogenerate
from backend.mcp.models import MCPServer  # noqa: F401 - Import models for autogenerate
from backend.organizations.models import Organization, OrganizationMember  # noqa: F401 - Import models for autogenerate
from backend.teams.models import Team, TeamMember  # noqa: F401 - Import models for autogenerate
from backend.invitations.models import Invitation  # noqa: F401 - Import models for autogenerate
from backend.theme_settings.models import (  # noqa: F401 - Import models for autogenerate
    OrganizationThemeSettings,
    TeamThemeSettings,
    UserThemeSettings,
)
from backend.core.config import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def get_url() -> str:
    return str(settings.SQLALCHEMY_DATABASE_URI)


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(get_url(), poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
