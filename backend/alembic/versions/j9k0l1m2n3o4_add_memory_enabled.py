"""Add memory_enabled to settings tables.

Note: Actual memory storage uses LangGraph's PostgresStore which manages
its own tables via setup(). This migration only adds the memory_enabled toggle.

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2024-12-21

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j9k0l1m2n3o4'
down_revision: Union[str, Sequence[str], None] = 'i8j9k0l1m2n3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add memory_enabled column to all settings tables."""
    # Organization settings
    op.add_column(
        'organization_settings',
        sa.Column('memory_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.alter_column('organization_settings', 'memory_enabled', server_default=None)

    # Team settings
    op.add_column(
        'team_settings',
        sa.Column('memory_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.alter_column('team_settings', 'memory_enabled', server_default=None)

    # User settings
    op.add_column(
        'user_settings',
        sa.Column('memory_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.alter_column('user_settings', 'memory_enabled', server_default=None)


def downgrade() -> None:
    """Remove memory_enabled column from all settings tables."""
    op.drop_column('user_settings', 'memory_enabled')
    op.drop_column('team_settings', 'memory_enabled')
    op.drop_column('organization_settings', 'memory_enabled')
