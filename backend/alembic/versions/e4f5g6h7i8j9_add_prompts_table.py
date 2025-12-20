from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'e4f5g6h7i8j9'
down_revision: Union[str, Sequence[str], None] = 'd3e4f5g6h7i8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'prompt',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=True),
        sa.Column('team_id', sa.Uuid(), nullable=True),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('prompt_type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column('created_by_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['team_id'], ['team.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.alter_column('prompt', 'is_active', server_default=None)

    op.create_index('ix_prompt_organization_id', 'prompt', ['organization_id'])
    op.create_index('ix_prompt_team_id', 'prompt', ['team_id'])
    op.create_index('ix_prompt_user_id', 'prompt', ['user_id'])
    op.create_index('ix_prompt_is_active', 'prompt', ['is_active'])

    op.create_index(
        'ix_prompt_org_scope',
        'prompt',
        ['organization_id', 'team_id', 'user_id', 'prompt_type'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_prompt_org_scope', table_name='prompt')
    op.drop_index('ix_prompt_is_active', table_name='prompt')
    op.drop_index('ix_prompt_user_id', table_name='prompt')
    op.drop_index('ix_prompt_team_id', table_name='prompt')
    op.drop_index('ix_prompt_organization_id', table_name='prompt')
    op.drop_table('prompt')
