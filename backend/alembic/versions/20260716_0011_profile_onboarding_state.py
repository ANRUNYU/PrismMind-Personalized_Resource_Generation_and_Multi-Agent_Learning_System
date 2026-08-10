"""persistent student profile onboarding state

Revision ID: 20260716_0011
Revises: 20260716_0010
"""
from alembic import op
import sqlalchemy as sa

revision = "20260716_0011"
down_revision = "20260716_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("profile_conversations",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", sa.Integer(), sa.ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mode", sa.String(32), server_default="onboarding", nullable=False), sa.Column("status", sa.String(32), server_default="active", nullable=False),
        sa.Column("current_step", sa.String(32), server_default="identity", nullable=False), sa.Column("summary", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_profile_conversations_user_status", "profile_conversations", ["user_id", "status"])
    op.create_table("profile_messages",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("profile_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(24), nullable=False), sa.Column("step", sa.String(32), nullable=False), sa.Column("content", sa.Text(), nullable=False),
        sa.Column("question", sa.Text()), sa.Column("answer", sa.Text()), sa.Column("extracted_fields", sa.JSON(), nullable=False),
        sa.Column("dimension_updates", sa.JSON(), nullable=False), sa.Column("profile_before", sa.JSON(), nullable=False), sa.Column("profile_after", sa.JSON(), nullable=False),
        sa.Column("idempotency_key", sa.String(120)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("conversation_id", "idempotency_key", name="uq_profile_message_conversation_key"))
    op.create_index("ix_profile_messages_conversation_created", "profile_messages", ["conversation_id", "created_at"])
    op.create_table("profile_evidence_events",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", sa.Integer(), sa.ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False), sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("source_type", sa.String(48), nullable=False), sa.Column("source_id", sa.String(120)), sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False), sa.Column("before", sa.JSON(), nullable=False), sa.Column("after", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_profile_event_user_idempotency"))
    op.create_index("ix_profile_events_user_created", "profile_evidence_events", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("profile_evidence_events")
    op.drop_table("profile_messages")
    op.drop_table("profile_conversations")
