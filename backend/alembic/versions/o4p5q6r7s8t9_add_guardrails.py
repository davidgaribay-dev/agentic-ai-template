"""Add guardrails tables for AI content filtering.

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2025-12-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "o4p5q6r7s8t9"
down_revision: str | None = "n3o4p5q6r7s8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create organization_guardrails table
    op.create_table(
        "organization_guardrails",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("guardrails_enabled", sa.Boolean(), nullable=False, default=True),
        # Input guardrails
        sa.Column("input_blocked_keywords", sa.JSON(), nullable=False, default=[]),
        sa.Column("input_blocked_patterns", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "input_action",
            sa.String(length=20),
            nullable=False,
            server_default="block",
        ),
        # Output guardrails
        sa.Column("output_blocked_keywords", sa.JSON(), nullable=False, default=[]),
        sa.Column("output_blocked_patterns", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "output_action",
            sa.String(length=20),
            nullable=False,
            server_default="redact",
        ),
        # PII detection
        sa.Column(
            "pii_detection_enabled", sa.Boolean(), nullable=False, default=False
        ),
        sa.Column("pii_types", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "pii_action", sa.String(length=20), nullable=False, server_default="redact"
        ),
        # Org-only settings
        sa.Column("allow_team_override", sa.Boolean(), nullable=False, default=True),
        sa.Column("allow_user_override", sa.Boolean(), nullable=False, default=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id"),
    )
    op.create_index(
        "idx_organization_guardrails_org_id",
        "organization_guardrails",
        ["organization_id"],
    )

    # Create team_guardrails table
    op.create_table(
        "team_guardrails",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("guardrails_enabled", sa.Boolean(), nullable=False, default=True),
        # Input guardrails
        sa.Column("input_blocked_keywords", sa.JSON(), nullable=False, default=[]),
        sa.Column("input_blocked_patterns", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "input_action",
            sa.String(length=20),
            nullable=False,
            server_default="block",
        ),
        # Output guardrails
        sa.Column("output_blocked_keywords", sa.JSON(), nullable=False, default=[]),
        sa.Column("output_blocked_patterns", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "output_action",
            sa.String(length=20),
            nullable=False,
            server_default="redact",
        ),
        # PII detection
        sa.Column(
            "pii_detection_enabled", sa.Boolean(), nullable=False, default=False
        ),
        sa.Column("pii_types", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "pii_action", sa.String(length=20), nullable=False, server_default="redact"
        ),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["team_id"],
            ["team.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id"),
    )
    op.create_index(
        "idx_team_guardrails_team_id",
        "team_guardrails",
        ["team_id"],
    )

    # Create user_guardrails table
    op.create_table(
        "user_guardrails",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("guardrails_enabled", sa.Boolean(), nullable=False, default=True),
        # Input guardrails
        sa.Column("input_blocked_keywords", sa.JSON(), nullable=False, default=[]),
        sa.Column("input_blocked_patterns", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "input_action",
            sa.String(length=20),
            nullable=False,
            server_default="block",
        ),
        # Output guardrails
        sa.Column("output_blocked_keywords", sa.JSON(), nullable=False, default=[]),
        sa.Column("output_blocked_patterns", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "output_action",
            sa.String(length=20),
            nullable=False,
            server_default="redact",
        ),
        # PII detection
        sa.Column(
            "pii_detection_enabled", sa.Boolean(), nullable=False, default=False
        ),
        sa.Column("pii_types", sa.JSON(), nullable=False, default=[]),
        sa.Column(
            "pii_action", sa.String(length=20), nullable=False, server_default="redact"
        ),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        "idx_user_guardrails_user_id",
        "user_guardrails",
        ["user_id"],
    )


def downgrade() -> None:
    # Drop user_guardrails table
    op.drop_index("idx_user_guardrails_user_id", table_name="user_guardrails")
    op.drop_table("user_guardrails")

    # Drop team_guardrails table
    op.drop_index("idx_team_guardrails_team_id", table_name="team_guardrails")
    op.drop_table("team_guardrails")

    # Drop organization_guardrails table
    op.drop_index(
        "idx_organization_guardrails_org_id", table_name="organization_guardrails"
    )
    op.drop_table("organization_guardrails")
