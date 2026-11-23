"""Attach existing callback receipts to the common request workflow."""

import sqlalchemy as sa
from alembic import op

revision = "6ee84a370c15"
down_revision = "83a4deca7b10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("consultation_requests", "name", existing_type=sa.String(120), nullable=True)
    op.add_column("consultation_requests", sa.Column("closure_reason", sa.Text(), nullable=True))
    op.add_column("callback_requests", sa.Column("request_id", sa.Integer(), nullable=True))
    op.execute("""
        DO $$
        DECLARE
            callback RECORD;
            new_request_id INTEGER;
        BEGIN
            FOR callback IN SELECT id, phone, created_at FROM callback_requests ORDER BY id LOOP
                INSERT INTO consultation_requests (contact, status, created_at, updated_at)
                    VALUES (callback.phone, 'new', callback.created_at, callback.created_at)
                    RETURNING id INTO new_request_id;
                UPDATE callback_requests SET request_id = new_request_id WHERE id = callback.id;
                INSERT INTO request_events (request_id, status, kind, occurred_at)
                    VALUES (new_request_id, 'new', 'created', callback.created_at);
            END LOOP;
        END $$;
    """)
    op.alter_column("callback_requests", "request_id", existing_type=sa.Integer(), nullable=False)
    op.create_unique_constraint("uq_callback_requests_request_id", "callback_requests", ["request_id"])
    op.create_foreign_key(
        "fk_callback_requests_request_id",
        "callback_requests",
        "consultation_requests",
        ["request_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM callback_requests)
                OR EXISTS (SELECT 1 FROM consultation_requests WHERE closure_reason IS NOT NULL)
            THEN
                RAISE EXCEPTION 'Downgrade would lose callback request links or closure reasons';
            END IF;
        END $$;
    """)
    op.drop_constraint("fk_callback_requests_request_id", "callback_requests", type_="foreignkey")
    op.drop_constraint("uq_callback_requests_request_id", "callback_requests", type_="unique")
    op.drop_column("callback_requests", "request_id")
    op.drop_column("consultation_requests", "closure_reason")
    op.execute("UPDATE consultation_requests SET name = '' WHERE name IS NULL")
    op.alter_column("consultation_requests", "name", existing_type=sa.String(120), nullable=False)
