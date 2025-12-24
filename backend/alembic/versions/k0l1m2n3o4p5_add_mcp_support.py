"""Add MCP (Model Context Protocol) support.

Adds MCP settings to organization, team, and user settings tables,
and creates the mcp_server table for registering MCP servers.

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "k0l1m2n3o4p5"
down_revision: str | Sequence[str] | None = "j9k0l1m2n3o4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add MCP settings columns and create mcp_server table."""

    # Organization settings - add MCP columns
    op.add_column(
        "organization_settings",
        sa.Column(
            "mcp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )
    op.add_column(
        "organization_settings",
        sa.Column(
            "mcp_allow_custom_servers",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "organization_settings",
        sa.Column(
            "mcp_max_servers_per_team",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("10"),
        ),
    )
    op.add_column(
        "organization_settings",
        sa.Column(
            "mcp_max_servers_per_user",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("5"),
        ),
    )
    # Remove server defaults after adding columns
    op.alter_column("organization_settings", "mcp_enabled", server_default=None)
    op.alter_column(
        "organization_settings", "mcp_allow_custom_servers", server_default=None
    )
    op.alter_column(
        "organization_settings", "mcp_max_servers_per_team", server_default=None
    )
    op.alter_column(
        "organization_settings", "mcp_max_servers_per_user", server_default=None
    )

    # Team settings - add MCP columns
    op.add_column(
        "team_settings",
        sa.Column(
            "mcp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )
    op.add_column(
        "team_settings",
        sa.Column(
            "mcp_allow_custom_servers",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("team_settings", "mcp_enabled", server_default=None)
    op.alter_column("team_settings", "mcp_allow_custom_servers", server_default=None)

    # User settings - add MCP column
    op.add_column(
        "user_settings",
        sa.Column(
            "mcp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )
    op.alter_column("user_settings", "mcp_enabled", server_default=None)

    # Create mcp_server table
    op.create_table(
        "mcp_server",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column(
            "transport", sa.String(length=20), nullable=False, server_default="http"
        ),
        sa.Column(
            "auth_type", sa.String(length=20), nullable=False, server_default="none"
        ),
        sa.Column("auth_header_name", sa.String(length=100), nullable=True),
        sa.Column("auth_secret_ref", sa.String(length=255), nullable=True),
        sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "tool_prefix", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organization.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["team_id"], ["team.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["user.id"]),
        sa.CheckConstraint(
            "(team_id IS NULL AND user_id IS NULL) OR "
            "(team_id IS NOT NULL AND user_id IS NULL) OR "
            "(team_id IS NOT NULL AND user_id IS NOT NULL)",
            name="valid_mcp_server_scope",
        ),
    )

    # Create indexes for efficient querying
    op.create_index("idx_mcp_server_org", "mcp_server", ["organization_id"])
    op.create_index(
        "idx_mcp_server_team",
        "mcp_server",
        ["team_id"],
        postgresql_where=sa.text("team_id IS NOT NULL"),
    )
    op.create_index(
        "idx_mcp_server_user",
        "mcp_server",
        ["user_id"],
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Remove MCP support."""

    # Drop indexes
    op.drop_index("idx_mcp_server_user", table_name="mcp_server")
    op.drop_index("idx_mcp_server_team", table_name="mcp_server")
    op.drop_index("idx_mcp_server_org", table_name="mcp_server")

    # Drop mcp_server table
    op.drop_table("mcp_server")

    # Remove MCP columns from settings tables
    op.drop_column("user_settings", "mcp_enabled")
    op.drop_column("team_settings", "mcp_allow_custom_servers")
    op.drop_column("team_settings", "mcp_enabled")
    op.drop_column("organization_settings", "mcp_max_servers_per_user")
    op.drop_column("organization_settings", "mcp_max_servers_per_team")
    op.drop_column("organization_settings", "mcp_allow_custom_servers")
    op.drop_column("organization_settings", "mcp_enabled")
