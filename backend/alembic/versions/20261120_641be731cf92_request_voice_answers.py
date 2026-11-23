"""Store private voice answers with consultation requests."""

import sqlalchemy as sa
from alembic import op

revision = "641be731cf92"
down_revision = "f83db7f9ad20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "consultation_requests",
        sa.Column("voice_fields", sa.JSON(), server_default="[]", nullable=False),
    )
    op.add_column("consultation_requests", sa.Column("voice_answers", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("consultation_requests", "voice_answers")
    op.drop_column("consultation_requests", "voice_fields")
