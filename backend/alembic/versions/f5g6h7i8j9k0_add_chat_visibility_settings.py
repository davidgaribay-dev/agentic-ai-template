from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "f5g6h7i8j9k0"
down_revision: str | Sequence[str] | None = "e4f5g6h7i8j9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organization_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column(
            "sidebar_chat_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "standalone_chat_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "chat_panel_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organization.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id"),
    )
    op.alter_column(
        "organization_settings", "sidebar_chat_enabled", server_default=None
    )
    op.alter_column(
        "organization_settings", "standalone_chat_enabled", server_default=None
    )
    op.alter_column("organization_settings", "chat_panel_enabled", server_default=None)

    op.create_table(
        "team_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column(
            "sidebar_chat_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "standalone_chat_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "chat_panel_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["team.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id"),
    )
    op.alter_column("team_settings", "sidebar_chat_enabled", server_default=None)
    op.alter_column("team_settings", "standalone_chat_enabled", server_default=None)
    op.alter_column("team_settings", "chat_panel_enabled", server_default=None)

    op.create_table(
        "user_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "sidebar_chat_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "standalone_chat_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "chat_panel_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.alter_column("user_settings", "sidebar_chat_enabled", server_default=None)
    op.alter_column("user_settings", "standalone_chat_enabled", server_default=None)
    op.alter_column("user_settings", "chat_panel_enabled", server_default=None)


def downgrade() -> None:
    op.drop_table("user_settings")
    op.drop_table("team_settings")
    op.drop_table("organization_settings")
