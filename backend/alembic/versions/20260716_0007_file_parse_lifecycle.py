"""add complete file parse lifecycle

Revision ID: 20260716_0007
Revises: 20260703_0006
"""

from alembic import op
import sqlalchemy as sa

revision = "20260716_0007"
down_revision = "20260703_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE file_parse_status ADD VALUE IF NOT EXISTS 'parsing' AFTER 'pending'")
    with op.batch_alter_table("file_assets") as batch:
        batch.add_column(sa.Column("parse_error", sa.Text(), nullable=True))
        batch.add_column(sa.Column("parsed_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("parsed_text_char_count", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("file_assets") as batch:
        batch.drop_column("parsed_text_char_count")
        batch.drop_column("parsed_at")
        batch.drop_column("parse_error")
    # PostgreSQL enum values cannot be safely removed while preserving existing rows.
