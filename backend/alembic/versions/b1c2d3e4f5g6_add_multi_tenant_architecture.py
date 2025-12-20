from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'b1c2d3e4f5g6'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'organization',
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('slug', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_organization_name'), 'organization', ['name'], unique=False)
    op.create_index(op.f('ix_organization_slug'), 'organization', ['slug'], unique=True)
    op.create_table(
        'organization_member',
        sa.Column('role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='member'),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'user_id', name='uq_organization_member_org_user')
    )
    op.create_table(
        'team',
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('slug', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'slug', name='uq_team_org_slug')
    )
    op.create_index(op.f('ix_team_name'), 'team', ['name'], unique=False)
    op.create_index(op.f('ix_team_slug'), 'team', ['slug'], unique=False)
    op.create_table(
        'team_member',
        sa.Column('role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='member'),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('team_id', sa.Uuid(), nullable=False),
        sa.Column('org_member_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['team_id'], ['team.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['org_member_id'], ['organization_member.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('team_id', 'org_member_id', name='uq_team_member_team_org_member')
    )

    op.create_table(
        'invitation',
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('team_id', sa.Uuid(), nullable=True),
        sa.Column('invited_by_id', sa.Uuid(), nullable=True),
        sa.Column('token_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column('org_role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='member'),
        sa.Column('team_role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='pending'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['team_id'], ['team.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invited_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_invitation_email'), 'invitation', ['email'], unique=False)
    op.create_index(op.f('ix_invitation_token_hash'), 'invitation', ['token_hash'], unique=True)
    op.alter_column('user', 'is_superuser', new_column_name='is_platform_admin')
    op.add_column('conversation', sa.Column('organization_id', sa.Uuid(), nullable=True))
    op.add_column('conversation', sa.Column('team_id', sa.Uuid(), nullable=True))
    op.add_column('conversation', sa.Column('created_by_id', sa.Uuid(), nullable=True))

    op.create_foreign_key(
        'fk_conversation_organization_id',
        'conversation', 'organization',
        ['organization_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_conversation_team_id',
        'conversation', 'team',
        ['team_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_conversation_created_by_id',
        'conversation', 'user',
        ['created_by_id'], ['id'],
        ondelete='SET NULL'
    )

    op.create_index(op.f('ix_conversation_organization_id'), 'conversation', ['organization_id'], unique=False)
    op.create_index(op.f('ix_conversation_team_id'), 'conversation', ['team_id'], unique=False)

    op.alter_column('conversation', 'user_id', nullable=True)


def downgrade() -> None:
    op.alter_column('conversation', 'user_id', nullable=False)
    op.drop_index(op.f('ix_conversation_team_id'), table_name='conversation')
    op.drop_index(op.f('ix_conversation_organization_id'), table_name='conversation')
    op.drop_constraint('fk_conversation_created_by_id', 'conversation', type_='foreignkey')
    op.drop_constraint('fk_conversation_team_id', 'conversation', type_='foreignkey')
    op.drop_constraint('fk_conversation_organization_id', 'conversation', type_='foreignkey')
    op.drop_column('conversation', 'created_by_id')
    op.drop_column('conversation', 'team_id')
    op.drop_column('conversation', 'organization_id')
    op.alter_column('user', 'is_platform_admin', new_column_name='is_superuser')
    op.drop_index(op.f('ix_invitation_token_hash'), table_name='invitation')
    op.drop_index(op.f('ix_invitation_email'), table_name='invitation')
    op.drop_table('invitation')
    op.drop_table('team_member')
    op.drop_index(op.f('ix_team_slug'), table_name='team')
    op.drop_index(op.f('ix_team_name'), table_name='team')
    op.drop_table('team')
    op.drop_table('organization_member')
    op.drop_index(op.f('ix_organization_slug'), table_name='organization')
    op.drop_index(op.f('ix_organization_name'), table_name='organization')
    op.drop_table('organization')
