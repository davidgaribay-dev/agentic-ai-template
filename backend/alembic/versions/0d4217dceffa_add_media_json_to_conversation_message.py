"""add_media_json_to_conversation_message

Revision ID: 0d4217dceffa
Revises: o4p5q6r7s8t9

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0d4217dceffa"
down_revision: Union[str, Sequence[str], None] = "o4p5q6r7s8t9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add media_json column to conversation_message table."""
    op.add_column(
        "conversation_message", sa.Column("media_json", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    """Remove media_json column from conversation_message table."""
    op.drop_column("conversation_message", "media_json")
