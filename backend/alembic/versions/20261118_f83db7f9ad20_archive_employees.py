"""Track archived staff accounts."""

import sqlalchemy as sa

from alembic import op

revision = "f83db7f9ad20"
down_revision = "d72e321a904c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "admin_users",
        sa.Column("is_archived", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("admin_users", "is_archived")
