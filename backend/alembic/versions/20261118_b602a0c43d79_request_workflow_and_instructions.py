"""Persist assigned specialists, request history, and published instructions."""

import sqlalchemy as sa

from alembic import op

revision = "b602a0c43d79"
down_revision = "f237bc7b07a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'clarifying'")
    op.execute("ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'matched'")
    op.alter_column(
        "consultation_requests", "audience", type_=sa.String(48), postgresql_using="audience::text"
    )
    for name in ("consultation_slots", "consultation_requests"):
        op.add_column(name, sa.Column("specialist_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            f"fk_{name}_specialist", name, "admin_users", ["specialist_id"], ["id"]
        )
    op.create_index(
        "ix_consultation_requests_specialist_id", "consultation_requests", ["specialist_id"]
    )
    op.create_table(
        "request_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "request_id",
            sa.Integer(),
            sa.ForeignKey("consultation_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL")),
        sa.Column("actor_name", sa.String(200)),
        sa.Column("specialist_name", sa.String(200)),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_request_events_request_id", "request_events", ["request_id"])
    op.execute("""
        INSERT INTO request_events (request_id, status, kind, actor_name, occurred_at)
            SELECT id, 'new', 'created', name, created_at FROM consultation_requests
    """)
    op.execute("""
        INSERT INTO request_events (request_id, status, kind, occurred_at)
            SELECT id, status::text, 'snapshot', updated_at
            FROM consultation_requests WHERE status::text <> 'new'
    """)
    op.create_table(
        "instruction_topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("title_key", sa.String(160), unique=True, nullable=False),
        sa.Column("description", sa.String(160), nullable=False),
    )
    op.create_table(
        "instructions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("title_audio_url", sa.String(2048)),
        sa.Column("description_audio_url", sa.String(2048)),
        sa.Column("audience", sa.String(48), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("instruction_topics.id"), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("start_step_id", sa.String(100)),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_instructions_audience", "instructions", ["audience"])
    op.create_index("ix_instructions_topic_id", "instructions", ["topic_id"])
    op.create_table(
        "instruction_media",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("media_type", sa.String(40), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("instruction_media")
    op.drop_table("instructions")
    op.drop_table("instruction_topics")
    op.drop_table("request_events")
    for name in ("consultation_requests", "consultation_slots"):
        op.drop_column(name, "specialist_id")
    op.execute("UPDATE consultation_requests SET audience = NULL WHERE audience LIKE 'role-%'")
    op.execute(
        "ALTER TABLE consultation_requests ALTER COLUMN audience TYPE audience "
        "USING audience::audience"
    )
    op.execute(
        "UPDATE consultation_requests SET status = 'new' "
        "WHERE status::text IN ('clarifying', 'matched')"
    )
    op.drop_index("uq_consultation_requests_active_slot", table_name="consultation_requests")
    op.execute("ALTER TYPE request_status RENAME TO revised_request_status")
    op.execute("CREATE TYPE request_status AS ENUM ('new', 'confirmed', 'done', 'cancelled')")
    op.execute(
        "ALTER TABLE consultation_requests ALTER COLUMN status TYPE request_status "
        "USING status::text::request_status"
    )
    op.execute("DROP TYPE revised_request_status")
    op.create_index(
        "uq_consultation_requests_active_slot",
        "consultation_requests",
        ["slot_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'cancelled'"),
    )
