"""add_sources_json_to_conversation_message

Revision ID: 919cdde4848d
Revises: 1861410445fb

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision: str = "919cdde4848d"
down_revision: str | Sequence[str] | None = "1861410445fb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add sources_json column to conversation_message table."""
    op.add_column(
        "conversation_message",
        sa.Column("sources_json", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )


def downgrade() -> None:
    """Remove sources_json column from conversation_message table."""
    op.drop_column("conversation_message", "sources_json")
