"""Store field changes and identify private consultation appointments."""

import sqlalchemy as sa

from alembic import op

revision = "d72e321a904c"
down_revision = "b602a0c43d79"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "consultation_slots",
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("request_events", sa.Column("changes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("request_events", "changes")
    op.drop_column("consultation_slots", "is_private")
