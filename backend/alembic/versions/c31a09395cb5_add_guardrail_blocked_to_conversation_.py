"""add_guardrail_blocked_to_conversation_message

Revision ID: c31a09395cb5
Revises: 0d4217dceffa

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c31a09395cb5"
down_revision: Union[str, Sequence[str], None] = "0d4217dceffa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add guardrail_blocked column to conversation_message table."""
    op.add_column(
        "conversation_message",
        sa.Column(
            "guardrail_blocked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    """Remove guardrail_blocked column from conversation_message table."""
    op.drop_column("conversation_message", "guardrail_blocked")
