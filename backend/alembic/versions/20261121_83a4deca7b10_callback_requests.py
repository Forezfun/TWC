"""Store callback requests without requiring a public user account."""

import sqlalchemy as sa
from alembic import op

revision = "83a4deca7b10"
down_revision = "641be731cf92"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "callback_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.Column("consent", sa.Boolean(), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_callback_requests_idempotency_key"),
    )


def downgrade() -> None:
    op.drop_table("callback_requests")
