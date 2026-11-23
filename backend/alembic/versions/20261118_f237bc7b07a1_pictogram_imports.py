"""Store pictogram sets, images and editor selection."""

import sqlalchemy as sa

from alembic import op

revision = "f237bc7b07a1"
down_revision = "83931fdacdef"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pictogram_sets",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("title_key", sa.String(64), nullable=False, unique=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("pictograms", sa.JSON(), nullable=False),
    )
    op.create_table(
        "pictogram_images",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("set_id", sa.String(50), sa.ForeignKey("pictogram_sets.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("media_type", sa.String(20), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
    )
    op.create_table(
        "pictogram_selection",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("set_id", sa.String(50), nullable=False),
        sa.Column("pictogram_ids", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("pictogram_selection")
    op.drop_table("pictogram_images")
    op.drop_table("pictogram_sets")
