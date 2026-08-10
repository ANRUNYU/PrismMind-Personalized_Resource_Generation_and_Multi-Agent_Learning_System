"""add student exercises

Revision ID: 20260703_0006
Revises: 20260701_0005
Create Date: 2026-07-03 00:06:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260703_0006"
down_revision: Union[str, None] = "20260701_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(none_as_null=True), "postgresql")


def _json_list_default() -> sa.TextClause:
    return sa.text("'[]'::jsonb") if op.get_bind().dialect.name == "postgresql" else sa.text("'[]'")


def _json_dict_default() -> sa.TextClause:
    return sa.text("'{}'::jsonb") if op.get_bind().dialect.name == "postgresql" else sa.text("'{}'")


def upgrade() -> None:
    op.create_table(
        "student_exercises",
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("difficulty", sa.String(length=40), server_default="medium", nullable=False),
        sa.Column("category", sa.String(length=80), server_default="个人习题", nullable=False),
        sa.Column("tags", _json_type(), server_default=_json_list_default(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="not_started", nullable=False),
        sa.Column("is_favorite", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("total_score", sa.Float(), server_default="100", nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("user_answer", sa.Text(), nullable=True),
        sa.Column("question_results", _json_type(), server_default=_json_list_default(), nullable=False),
        sa.Column("quality_analysis", _json_type(), server_default=_json_dict_default(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_student_exercises_id"), "student_exercises", ["id"], unique=False)
    op.create_index(op.f("ix_student_exercises_student_id"), "student_exercises", ["student_id"], unique=False)
    op.create_index(op.f("ix_student_exercises_difficulty"), "student_exercises", ["difficulty"], unique=False)
    op.create_index(op.f("ix_student_exercises_category"), "student_exercises", ["category"], unique=False)
    op.create_index(op.f("ix_student_exercises_status"), "student_exercises", ["status"], unique=False)
    op.create_index(op.f("ix_student_exercises_is_favorite"), "student_exercises", ["is_favorite"], unique=False)
    op.create_index(op.f("ix_student_exercises_created_at"), "student_exercises", ["created_at"], unique=False)
    op.create_index("ix_student_exercises_student_status", "student_exercises", ["student_id", "status"], unique=False)
    op.create_index("ix_student_exercises_student_favorite", "student_exercises", ["student_id", "is_favorite"], unique=False)
    op.create_index("ix_student_exercises_student_updated_at", "student_exercises", ["student_id", "updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_student_exercises_student_updated_at", table_name="student_exercises")
    op.drop_index("ix_student_exercises_student_favorite", table_name="student_exercises")
    op.drop_index("ix_student_exercises_student_status", table_name="student_exercises")
    op.drop_index(op.f("ix_student_exercises_created_at"), table_name="student_exercises")
    op.drop_index(op.f("ix_student_exercises_is_favorite"), table_name="student_exercises")
    op.drop_index(op.f("ix_student_exercises_status"), table_name="student_exercises")
    op.drop_index(op.f("ix_student_exercises_category"), table_name="student_exercises")
    op.drop_index(op.f("ix_student_exercises_difficulty"), table_name="student_exercises")
    op.drop_index(op.f("ix_student_exercises_student_id"), table_name="student_exercises")
    op.drop_index(op.f("ix_student_exercises_id"), table_name="student_exercises")
    op.drop_table("student_exercises")
