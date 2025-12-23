"""Add chat media table for multimodal chat.

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2025-12-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "n3o4p5q6r7s8"
down_revision: str | None = "919cdde4848d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create chat_media table
    op.create_table(
        "chat_media",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["user.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["team_id"],
            ["team.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_chat_media_filename", "chat_media", ["filename"])
    op.create_index("idx_chat_media_created_by", "chat_media", ["created_by_id"])
    op.create_index(
        "idx_chat_media_org_team_user",
        "chat_media",
        ["organization_id", "team_id", "user_id"],
    )
    op.create_index("idx_chat_media_deleted_at", "chat_media", ["deleted_at"])

    # Add media settings to organization_settings
    op.add_column(
        "organization_settings",
        sa.Column(
            "max_media_file_size_mb",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
    )
    op.add_column(
        "organization_settings",
        sa.Column(
            "max_media_per_message",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
    )
    op.add_column(
        "organization_settings",
        sa.Column(
            "max_media_storage_mb",
            sa.Integer(),
            nullable=True,
        ),
    )

    # Add media_ids column to conversation_message for persistence
    op.add_column(
        "conversation_message",
        sa.Column("media_ids", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    # Remove media_ids from conversation_message
    op.drop_column("conversation_message", "media_ids")

    # Remove media settings from organization_settings
    op.drop_column("organization_settings", "max_media_storage_mb")
    op.drop_column("organization_settings", "max_media_per_message")
    op.drop_column("organization_settings", "max_media_file_size_mb")

    # Drop chat_media table
    op.drop_index("idx_chat_media_deleted_at", table_name="chat_media")
    op.drop_index("idx_chat_media_org_team_user", table_name="chat_media")
    op.drop_index("idx_chat_media_created_by", table_name="chat_media")
    op.drop_index("idx_chat_media_filename", table_name="chat_media")
    op.drop_table("chat_media")
