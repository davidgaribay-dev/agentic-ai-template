from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
import sqlmodel

revision: str = "4b9e4fc41ca2"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column(
            "email", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column(
            "full_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "hashed_password", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)
    op.create_table(
        "item",
        sa.Column(
            "title", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column(
            "description", sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("item")
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
