"""add deleted_at to conversation_message

Revision ID: e3c17681a0a5
Revises: c31a09395cb5

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3c17681a0a5"
down_revision: Union[str, Sequence[str], None] = "c31a09395cb5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add deleted_at column to conversation_message for soft-delete support."""
    op.add_column(
        "conversation_message", sa.Column("deleted_at", sa.DateTime(), nullable=True)
    )
    op.create_index(
        op.f("ix_conversation_message_deleted_at"),
        "conversation_message",
        ["deleted_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove deleted_at column from conversation_message."""
    op.drop_index(
        op.f("ix_conversation_message_deleted_at"), table_name="conversation_message"
    )
    op.drop_column("conversation_message", "deleted_at")
