"""Add tool configuration settings.

Adds disabled_mcp_servers and disabled_tools JSON columns to
organization, team, and user settings tables for granular
tool enable/disable control.

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "m2n3o4p5q6r7"
down_revision: str | None = "l1m2n3o4p5q6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Organization settings - add tool configuration columns
    op.add_column(
        "organization_settings",
        sa.Column(
            "disabled_mcp_servers",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        "organization_settings",
        sa.Column(
            "disabled_tools",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )

    # Team settings - add tool configuration columns
    op.add_column(
        "team_settings",
        sa.Column(
            "disabled_mcp_servers",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        "team_settings",
        sa.Column(
            "disabled_tools",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )

    # User settings - add tool configuration columns
    op.add_column(
        "user_settings",
        sa.Column(
            "disabled_mcp_servers",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column(
            "disabled_tools",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "disabled_tools")
    op.drop_column("user_settings", "disabled_mcp_servers")
    op.drop_column("team_settings", "disabled_tools")
    op.drop_column("team_settings", "disabled_mcp_servers")
    op.drop_column("organization_settings", "disabled_tools")
    op.drop_column("organization_settings", "disabled_mcp_servers")
