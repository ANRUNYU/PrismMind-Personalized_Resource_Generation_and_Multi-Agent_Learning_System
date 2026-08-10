"""add assistant sessions and messages

Revision ID: 20260618_0004
Revises: 20260618_0003
Create Date: 2026-06-18 00:04:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260618_0004"
down_revision: Union[str, None] = "20260618_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(none_as_null=True), "postgresql")


def upgrade() -> None:
    op.create_table(
        "assistant_sessions",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=160), server_default="New assistant chat", nullable=False),
        sa.Column("mode", sa.String(length=32), server_default="general", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_assistant_sessions_course_id_courses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_assistant_sessions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assistant_sessions")),
    )
    op.create_index("ix_assistant_sessions_course_id", "assistant_sessions", ["course_id"], unique=False)
    op.create_index("ix_assistant_sessions_course_user", "assistant_sessions", ["course_id", "user_id"], unique=False)
    op.create_index("ix_assistant_sessions_created_at", "assistant_sessions", ["created_at"], unique=False)
    op.create_index("ix_assistant_sessions_id", "assistant_sessions", ["id"], unique=False)
    op.create_index("ix_assistant_sessions_mode", "assistant_sessions", ["mode"], unique=False)
    op.create_index("ix_assistant_sessions_status", "assistant_sessions", ["status"], unique=False)
    op.create_index("ix_assistant_sessions_user_id", "assistant_sessions", ["user_id"], unique=False)
    op.create_index("ix_assistant_sessions_user_status", "assistant_sessions", ["user_id", "status"], unique=False)
    op.create_index("ix_assistant_sessions_user_updated_at", "assistant_sessions", ["user_id", "updated_at"], unique=False)

    op.create_table(
        "assistant_messages",
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("references", _json_type(), nullable=False),
        sa.Column("attachment_file_ids", _json_type(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["assistant_sessions.id"],
            name=op.f("fk_assistant_messages_session_id_assistant_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assistant_messages")),
    )
    op.create_index("ix_assistant_messages_created_at", "assistant_messages", ["created_at"], unique=False)
    op.create_index("ix_assistant_messages_id", "assistant_messages", ["id"], unique=False)
    op.create_index("ix_assistant_messages_role", "assistant_messages", ["role"], unique=False)
    op.create_index("ix_assistant_messages_role_created_at", "assistant_messages", ["role", "created_at"], unique=False)
    op.create_index("ix_assistant_messages_session_created_at", "assistant_messages", ["session_id", "created_at"], unique=False)
    op.create_index("ix_assistant_messages_session_id", "assistant_messages", ["session_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_assistant_messages_session_id", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_session_created_at", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_role_created_at", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_role", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_id", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_created_at", table_name="assistant_messages")
    op.drop_table("assistant_messages")

    op.drop_index("ix_assistant_sessions_user_updated_at", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_user_status", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_user_id", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_status", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_mode", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_id", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_created_at", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_course_user", table_name="assistant_sessions")
    op.drop_index("ix_assistant_sessions_course_id", table_name="assistant_sessions")
    op.drop_table("assistant_sessions")
