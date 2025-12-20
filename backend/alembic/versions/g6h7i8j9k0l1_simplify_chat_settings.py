from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g6h7i8j9k0l1'
down_revision: Union[str, Sequence[str], None] = 'f5g6h7i8j9k0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'organization_settings',
        sa.Column('chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.execute("""
        UPDATE organization_settings
        SET chat_enabled = (sidebar_chat_enabled AND standalone_chat_enabled AND chat_panel_enabled)
    """)
    op.alter_column('organization_settings', 'chat_enabled', server_default=None)
    op.drop_column('organization_settings', 'sidebar_chat_enabled')
    op.drop_column('organization_settings', 'standalone_chat_enabled')
    op.drop_column('organization_settings', 'chat_panel_enabled')

    op.add_column(
        'team_settings',
        sa.Column('chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.execute("""
        UPDATE team_settings
        SET chat_enabled = (sidebar_chat_enabled AND standalone_chat_enabled AND chat_panel_enabled)
    """)
    op.alter_column('team_settings', 'chat_enabled', server_default=None)
    op.drop_column('team_settings', 'sidebar_chat_enabled')
    op.drop_column('team_settings', 'standalone_chat_enabled')
    op.drop_column('team_settings', 'chat_panel_enabled')

    op.add_column(
        'user_settings',
        sa.Column('chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.execute("""
        UPDATE user_settings
        SET chat_enabled = (sidebar_chat_enabled AND standalone_chat_enabled AND chat_panel_enabled)
    """)
    op.alter_column('user_settings', 'chat_enabled', server_default=None)
    op.drop_column('user_settings', 'sidebar_chat_enabled')
    op.drop_column('user_settings', 'standalone_chat_enabled')
    op.drop_column('user_settings', 'chat_panel_enabled')


def downgrade() -> None:
    op.add_column(
        'user_settings',
        sa.Column('sidebar_chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.add_column(
        'user_settings',
        sa.Column('standalone_chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.add_column(
        'user_settings',
        sa.Column('chat_panel_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.execute("""
        UPDATE user_settings
        SET sidebar_chat_enabled = chat_enabled,
            standalone_chat_enabled = chat_enabled,
            chat_panel_enabled = chat_enabled
    """)
    op.alter_column('user_settings', 'sidebar_chat_enabled', server_default=None)
    op.alter_column('user_settings', 'standalone_chat_enabled', server_default=None)
    op.alter_column('user_settings', 'chat_panel_enabled', server_default=None)
    op.drop_column('user_settings', 'chat_enabled')

    op.add_column(
        'team_settings',
        sa.Column('sidebar_chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.add_column(
        'team_settings',
        sa.Column('standalone_chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.add_column(
        'team_settings',
        sa.Column('chat_panel_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.execute("""
        UPDATE team_settings
        SET sidebar_chat_enabled = chat_enabled,
            standalone_chat_enabled = chat_enabled,
            chat_panel_enabled = chat_enabled
    """)
    op.alter_column('team_settings', 'sidebar_chat_enabled', server_default=None)
    op.alter_column('team_settings', 'standalone_chat_enabled', server_default=None)
    op.alter_column('team_settings', 'chat_panel_enabled', server_default=None)
    op.drop_column('team_settings', 'chat_enabled')

    op.add_column(
        'organization_settings',
        sa.Column('sidebar_chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.add_column(
        'organization_settings',
        sa.Column('standalone_chat_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.add_column(
        'organization_settings',
        sa.Column('chat_panel_enabled', sa.Boolean(), nullable=False, server_default=sa.text("true"))
    )
    op.execute("""
        UPDATE organization_settings
        SET sidebar_chat_enabled = chat_enabled,
            standalone_chat_enabled = chat_enabled,
            chat_panel_enabled = chat_enabled
    """)
    op.alter_column('organization_settings', 'sidebar_chat_enabled', server_default=None)
    op.alter_column('organization_settings', 'standalone_chat_enabled', server_default=None)
    op.alter_column('organization_settings', 'chat_panel_enabled', server_default=None)
    op.drop_column('organization_settings', 'chat_enabled')
