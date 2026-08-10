"""add course members and course status

Revision ID: 20260618_0002
Revises: 20260519_0001
Create Date: 2026-06-18 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260618_0002"
down_revision: Union[str, None] = "20260519_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
    )
    op.create_index("ix_courses_status", "courses", ["status"], unique=False)
    op.create_index("ix_courses_status_created_at", "courses", ["status", "created_at"], unique=False)

    op.execute(
        """
        UPDATE courses
        SET code = 'PM-' || lpad(id::text, 6, '0')
        WHERE code IS NULL OR trim(code) = ''
        """
    )
    op.alter_column("courses", "code", existing_type=sa.String(length=64), nullable=False)

    op.create_table(
        "course_members",
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_course_members_course_id_courses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_course_members_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_members")),
        sa.UniqueConstraint("course_id", "user_id", name="uq_course_members_course_id_user_id"),
    )
    op.create_index("ix_course_members_course_id", "course_members", ["course_id"], unique=False)
    op.create_index("ix_course_members_course_role_status", "course_members", ["course_id", "role", "status"], unique=False)
    op.create_index("ix_course_members_created_at", "course_members", ["created_at"], unique=False)
    op.create_index("ix_course_members_id", "course_members", ["id"], unique=False)
    op.create_index("ix_course_members_role", "course_members", ["role"], unique=False)
    op.create_index("ix_course_members_status", "course_members", ["status"], unique=False)
    op.create_index("ix_course_members_user_id", "course_members", ["user_id"], unique=False)
    op.create_index("ix_course_members_user_status", "course_members", ["user_id", "status"], unique=False)

    op.execute(
        """
        INSERT INTO course_members
            (course_id, user_id, role, status, joined_at, created_at, updated_at)
        SELECT id, owner_id, 'teacher', 'active', now(), now(), now()
        FROM courses
        WHERE owner_id IS NOT NULL
        ON CONFLICT (course_id, user_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_course_members_user_status", table_name="course_members")
    op.drop_index("ix_course_members_user_id", table_name="course_members")
    op.drop_index("ix_course_members_status", table_name="course_members")
    op.drop_index("ix_course_members_role", table_name="course_members")
    op.drop_index("ix_course_members_id", table_name="course_members")
    op.drop_index("ix_course_members_created_at", table_name="course_members")
    op.drop_index("ix_course_members_course_role_status", table_name="course_members")
    op.drop_index("ix_course_members_course_id", table_name="course_members")
    op.drop_table("course_members")

    op.alter_column("courses", "code", existing_type=sa.String(length=64), nullable=True)
    op.drop_index("ix_courses_status_created_at", table_name="courses")
    op.drop_index("ix_courses_status", table_name="courses")
    op.drop_column("courses", "status")
