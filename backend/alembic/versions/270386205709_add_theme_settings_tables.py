"""add theme settings tables

Revision ID: 270386205709
Revises: 959c0f0c6e08

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel

# revision identifiers, used by Alembic.
revision: str = "270386205709"
down_revision: str | Sequence[str] | None = "959c0f0c6e08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create theme settings tables
    op.create_table(
        "organization_theme_settings",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "default_theme_mode", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column(
            "default_light_theme", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column(
            "default_dark_theme", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column(
            "custom_light_theme", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "custom_dark_theme", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("theme_customization_enabled", sa.Boolean(), nullable=False),
        sa.Column("allow_team_customization", sa.Boolean(), nullable=False),
        sa.Column("allow_user_customization", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organization.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id"),
    )
    op.create_table(
        "user_theme_settings",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("theme_mode", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("light_theme", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("dark_theme", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "custom_light_theme", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "custom_dark_theme", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "team_theme_settings",
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "default_theme_mode", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column(
            "default_light_theme", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column(
            "default_dark_theme", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column(
            "custom_light_theme", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "custom_dark_theme", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("theme_customization_enabled", sa.Boolean(), nullable=False),
        sa.Column("allow_user_customization", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["team.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("team_theme_settings")
    op.drop_table("user_theme_settings")
    op.drop_table("organization_theme_settings")
