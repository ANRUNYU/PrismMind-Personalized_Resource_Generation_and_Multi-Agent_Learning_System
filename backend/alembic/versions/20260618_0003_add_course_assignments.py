"""add course assignments and submissions

Revision ID: 20260618_0003
Revises: 20260618_0002
Create Date: 2026-06-18 00:03:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260618_0003"
down_revision: Union[str, None] = "20260618_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(none_as_null=True), "postgresql")


def upgrade() -> None:
    op.create_table(
        "course_assignments",
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assignment_type", sa.String(length=32), server_default="quiz", nullable=False),
        sa.Column("source", sa.String(length=32), server_default="ai_generated", nullable=False),
        sa.Column("difficulty", sa.String(length=40), server_default="medium", nullable=False),
        sa.Column("topic", sa.String(length=255), nullable=True),
        sa.Column("question_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_score", sa.Float(), server_default="100", nullable=False),
        sa.Column("time_limit_minutes", sa.Integer(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="published", nullable=False),
        sa.Column("knowledge_document_ids", _json_type(), nullable=False),
        sa.Column("questions", _json_type(), nullable=False),
        sa.Column("answer_key", _json_type(), nullable=False),
        sa.Column("explanations", _json_type(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_course_assignments_course_id_courses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], name=op.f("fk_course_assignments_teacher_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_assignments")),
    )
    op.create_index("ix_course_assignments_assignment_type", "course_assignments", ["assignment_type"], unique=False)
    op.create_index("ix_course_assignments_course_id", "course_assignments", ["course_id"], unique=False)
    op.create_index("ix_course_assignments_course_status", "course_assignments", ["course_id", "status"], unique=False)
    op.create_index("ix_course_assignments_created_at", "course_assignments", ["created_at"], unique=False)
    op.create_index("ix_course_assignments_difficulty", "course_assignments", ["difficulty"], unique=False)
    op.create_index("ix_course_assignments_id", "course_assignments", ["id"], unique=False)
    op.create_index("ix_course_assignments_status", "course_assignments", ["status"], unique=False)
    op.create_index("ix_course_assignments_teacher_created_at", "course_assignments", ["teacher_id", "created_at"], unique=False)
    op.create_index("ix_course_assignments_teacher_id", "course_assignments", ["teacher_id"], unique=False)
    op.create_index("ix_course_assignments_topic", "course_assignments", ["topic"], unique=False)

    op.create_table(
        "course_assignment_submissions",
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=True),
        sa.Column("answers", _json_type(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("max_score", sa.Float(), server_default="100", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="not_started", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("feedback", _json_type(), nullable=False),
        sa.Column("question_results", _json_type(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["course_assignments.id"],
            name=op.f("fk_course_assignment_submissions_assignment_id_course_assignments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name=op.f("fk_course_assignment_submissions_course_id_courses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_course_assignment_submissions_student_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_assignment_submissions")),
        sa.UniqueConstraint("assignment_id", "student_id", name="uq_course_assignment_submissions_assignment_student"),
    )
    op.create_index(
        "ix_course_assignment_submissions_assignment_id",
        "course_assignment_submissions",
        ["assignment_id"],
        unique=False,
    )
    op.create_index(
        "ix_course_assignment_submissions_assignment_status",
        "course_assignment_submissions",
        ["assignment_id", "status"],
        unique=False,
    )
    op.create_index("ix_course_assignment_submissions_course_id", "course_assignment_submissions", ["course_id"], unique=False)
    op.create_index(
        "ix_course_assignment_submissions_course_student",
        "course_assignment_submissions",
        ["course_id", "student_id"],
        unique=False,
    )
    op.create_index("ix_course_assignment_submissions_created_at", "course_assignment_submissions", ["created_at"], unique=False)
    op.create_index("ix_course_assignment_submissions_id", "course_assignment_submissions", ["id"], unique=False)
    op.create_index("ix_course_assignment_submissions_status", "course_assignment_submissions", ["status"], unique=False)
    op.create_index("ix_course_assignment_submissions_student_id", "course_assignment_submissions", ["student_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_course_assignment_submissions_student_id", table_name="course_assignment_submissions")
    op.drop_index("ix_course_assignment_submissions_status", table_name="course_assignment_submissions")
    op.drop_index("ix_course_assignment_submissions_id", table_name="course_assignment_submissions")
    op.drop_index("ix_course_assignment_submissions_created_at", table_name="course_assignment_submissions")
    op.drop_index("ix_course_assignment_submissions_course_student", table_name="course_assignment_submissions")
    op.drop_index("ix_course_assignment_submissions_course_id", table_name="course_assignment_submissions")
    op.drop_index("ix_course_assignment_submissions_assignment_status", table_name="course_assignment_submissions")
    op.drop_index("ix_course_assignment_submissions_assignment_id", table_name="course_assignment_submissions")
    op.drop_table("course_assignment_submissions")

    op.drop_index("ix_course_assignments_topic", table_name="course_assignments")
    op.drop_index("ix_course_assignments_teacher_id", table_name="course_assignments")
    op.drop_index("ix_course_assignments_teacher_created_at", table_name="course_assignments")
    op.drop_index("ix_course_assignments_status", table_name="course_assignments")
    op.drop_index("ix_course_assignments_id", table_name="course_assignments")
    op.drop_index("ix_course_assignments_difficulty", table_name="course_assignments")
    op.drop_index("ix_course_assignments_created_at", table_name="course_assignments")
    op.drop_index("ix_course_assignments_course_status", table_name="course_assignments")
    op.drop_index("ix_course_assignments_course_id", table_name="course_assignments")
    op.drop_index("ix_course_assignments_assignment_type", table_name="course_assignments")
    op.drop_table("course_assignments")
