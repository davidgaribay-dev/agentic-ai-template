"""Add MCP tool approval required setting.

Revision ID: l1m2n3o4p5q6
Revises: k0l1m2n3o4p5
Create Date: 2025-12-21

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "l1m2n3o4p5q6"
down_revision: str | None = "k0l1m2n3o4p5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add mcp_tool_approval_required to organization_settings
    op.add_column(
        "organization_settings",
        sa.Column(
            "mcp_tool_approval_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # Add mcp_tool_approval_required to team_settings
    op.add_column(
        "team_settings",
        sa.Column(
            "mcp_tool_approval_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # Add mcp_tool_approval_required to user_settings
    op.add_column(
        "user_settings",
        sa.Column(
            "mcp_tool_approval_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "mcp_tool_approval_required")
    op.drop_column("team_settings", "mcp_tool_approval_required")
    op.drop_column("organization_settings", "mcp_tool_approval_required")
