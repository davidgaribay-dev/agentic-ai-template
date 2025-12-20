from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'i8j9k0l1m2n3'
down_revision: Union[str, Sequence[str], None] = 'h7i8j9k0l1m2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'organization',
        sa.Column('logo_url', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True)
    )
    op.add_column(
        'team',
        sa.Column('logo_url', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('team', 'logo_url')
    op.drop_column('organization', 'logo_url')
