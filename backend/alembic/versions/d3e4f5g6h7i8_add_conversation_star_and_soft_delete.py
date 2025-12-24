from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "d3e4f5g6h7i8"
down_revision: str | Sequence[str] | None = "c2d3e4f5g6h7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversation",
        sa.Column(
            "is_starred",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("conversation", "is_starred", server_default=None)

    op.add_column(
        "conversation",
        sa.Column(
            "deleted_at",
            sa.DateTime(),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_conversation_deleted_at",
        "conversation",
        ["deleted_at"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_conversation_deleted_at", table_name="conversation")
    op.drop_column("conversation", "deleted_at")
    op.drop_column("conversation", "is_starred")
