from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "h7i8j9k0l1m2"
down_revision: str | Sequence[str] | None = "g6h7i8j9k0l1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organization_settings",
        sa.Column(
            "chat_panel_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("organization_settings", "chat_panel_enabled", server_default=None)

    op.add_column(
        "team_settings",
        sa.Column(
            "chat_panel_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("team_settings", "chat_panel_enabled", server_default=None)

    op.add_column(
        "user_settings",
        sa.Column(
            "chat_panel_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("user_settings", "chat_panel_enabled", server_default=None)


def downgrade() -> None:
    """Remove chat_panel_enabled column from all settings tables."""
    op.drop_column("user_settings", "chat_panel_enabled")
    op.drop_column("team_settings", "chat_panel_enabled")
    op.drop_column("organization_settings", "chat_panel_enabled")
