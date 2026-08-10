"""add assistant message streaming lifecycle

Revision ID: 20260716_0009
Revises: 20260716_0008
"""

from alembic import op
import sqlalchemy as sa

revision = "20260716_0009"
down_revision = "20260716_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assistant_messages", sa.Column("status", sa.String(length=24), server_default="completed", nullable=False))
    op.add_column("assistant_messages", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("assistant_messages", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE assistant_messages SET completed_at = updated_at WHERE status = 'completed'")
    op.create_index("ix_assistant_messages_status", "assistant_messages", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_assistant_messages_status", table_name="assistant_messages")
    op.drop_column("assistant_messages", "completed_at")
    op.drop_column("assistant_messages", "error_message")
    op.drop_column("assistant_messages", "status")
