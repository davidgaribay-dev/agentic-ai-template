"""add_user_language_field

Revision ID: bec5ec068ea5
Revises: a3732d34e9a7

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bec5ec068ea5"
down_revision: str | Sequence[str] | None = "a3732d34e9a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add language field to user table with default 'en'."""
    op.add_column(
        "user",
        sa.Column(
            "language",
            sqlmodel.sql.sqltypes.AutoString(length=10),
            nullable=False,
            server_default="en",
        ),
    )


def downgrade() -> None:
    """Remove language field from user table."""
    op.drop_column("user", "language")
