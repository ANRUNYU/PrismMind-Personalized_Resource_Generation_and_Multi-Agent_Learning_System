"""initial enterprise schema

Revision ID: 20260519_0001
Revises:
Create Date: 2026-05-19 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260519_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def jsonb() -> postgresql.JSONB:
    return postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=True),
        sa.Column("role", sa.Enum("teacher", "student", "admin", name="user_role"), server_default="student", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("username", name=op.f("uq_users_username")),
    )
    op.create_index("ix_users_created_at", "users", ["created_at"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_role", "users", ["role"], unique=False)
    op.create_index("ix_users_role_created_at", "users", ["role", "created_at"], unique=False)
    op.create_index("ix_users_username", "users", ["username"], unique=False)

    op.create_table(
        "courses",
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_courses_owner_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_courses")),
        sa.UniqueConstraint("code", name=op.f("uq_courses_code")),
    )
    op.create_index("ix_courses_code", "courses", ["code"], unique=False)
    op.create_index("ix_courses_created_at", "courses", ["created_at"], unique=False)
    op.create_index("ix_courses_id", "courses", ["id"], unique=False)
    op.create_index("ix_courses_name", "courses", ["name"], unique=False)
    op.create_index("ix_courses_owner_created_at", "courses", ["owner_id", "created_at"], unique=False)
    op.create_index("ix_courses_owner_id", "courses", ["owner_id"], unique=False)

    op.create_table(
        "file_assets",
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("file_hash", sa.String(length=128), nullable=False),
        sa.Column("asset_type", sa.String(length=80), nullable=False),
        sa.Column("parse_status", sa.Enum("pending", "parsed", "failed", "deleted", name="file_parse_status"), server_default="pending", nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_file_assets_owner_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_file_assets")),
        sa.UniqueConstraint("storage_path", name=op.f("uq_file_assets_storage_path")),
    )
    op.create_index("ix_file_assets_asset_type", "file_assets", ["asset_type"], unique=False)
    op.create_index("ix_file_assets_created_at", "file_assets", ["created_at"], unique=False)
    op.create_index("ix_file_assets_file_hash", "file_assets", ["file_hash"], unique=False)
    op.create_index("ix_file_assets_id", "file_assets", ["id"], unique=False)
    op.create_index("ix_file_assets_owner_created_at", "file_assets", ["owner_id", "created_at"], unique=False)
    op.create_index("ix_file_assets_owner_id", "file_assets", ["owner_id"], unique=False)
    op.create_index("ix_file_assets_owner_parse_status", "file_assets", ["owner_id", "parse_status"], unique=False)
    op.create_index("ix_file_assets_parse_status", "file_assets", ["parse_status"], unique=False)

    op.create_table(
        "generated_artifacts",
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column(
            "artifact_type",
            sa.Enum("training_plan", "course_design", "teaching_design", "exercise", "paper", "project_practice", "learning_plan", name="artifact_type"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_format", sa.String(length=40), server_default="markdown", nullable=False),
        sa.Column("request_payload", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("status", sa.Enum("draft", "generating", "completed", "failed", name="artifact_status"), server_default="completed", nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=True),
        sa.Column("token_usage", jsonb(), nullable=True),
        sa.Column("file_asset_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["file_asset_id"], ["file_assets.id"], name=op.f("fk_generated_artifacts_file_asset_id_file_assets"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_generated_artifacts_owner_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_generated_artifacts")),
    )
    op.create_index("ix_generated_artifacts_artifact_type", "generated_artifacts", ["artifact_type"], unique=False)
    op.create_index("ix_generated_artifacts_created_at", "generated_artifacts", ["created_at"], unique=False)
    op.create_index("ix_generated_artifacts_file_asset_id", "generated_artifacts", ["file_asset_id"], unique=False)
    op.create_index("ix_generated_artifacts_id", "generated_artifacts", ["id"], unique=False)
    op.create_index("ix_generated_artifacts_owner_id", "generated_artifacts", ["owner_id"], unique=False)
    op.create_index("ix_generated_artifacts_owner_status", "generated_artifacts", ["owner_id", "status"], unique=False)
    op.create_index("ix_generated_artifacts_owner_type_created_at", "generated_artifacts", ["owner_id", "artifact_type", "created_at"], unique=False)
    op.create_index("ix_generated_artifacts_status", "generated_artifacts", ["status"], unique=False)

    op.create_table(
        "student_profiles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("major", sa.String(length=120), nullable=True),
        sa.Column("grade", sa.String(length=60), nullable=True),
        sa.Column("learning_goal", sa.Text(), nullable=True),
        sa.Column("knowledge_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("practice_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("innovation_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("exam_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("efficiency_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("quality_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("profile_summary", sa.Text(), nullable=True),
        sa.Column("profile_data", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("build_step", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_complete", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_student_profiles_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_student_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_student_profiles_user_id")),
    )
    op.create_index("ix_student_profiles_created_at", "student_profiles", ["created_at"], unique=False)
    op.create_index("ix_student_profiles_id", "student_profiles", ["id"], unique=False)
    op.create_index("ix_student_profiles_user_id", "student_profiles", ["user_id"], unique=False)
    op.create_index("ix_student_profiles_user_updated_at", "student_profiles", ["user_id", "updated_at"], unique=False)

    op.create_table(
        "question_bank",
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("creator_id", sa.Integer(), nullable=True),
        sa.Column("question_type", sa.String(length=80), nullable=False),
        sa.Column("difficulty", sa.String(length=40), nullable=True),
        sa.Column("stem", sa.Text(), nullable=False),
        sa.Column("options", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("knowledge_points", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_question_bank_course_id_courses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"], name=op.f("fk_question_bank_creator_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_bank")),
    )
    op.create_index("ix_question_bank_course_difficulty", "question_bank", ["course_id", "difficulty"], unique=False)
    op.create_index("ix_question_bank_course_id", "question_bank", ["course_id"], unique=False)
    op.create_index("ix_question_bank_created_at", "question_bank", ["created_at"], unique=False)
    op.create_index("ix_question_bank_creator_created_at", "question_bank", ["creator_id", "created_at"], unique=False)
    op.create_index("ix_question_bank_creator_id", "question_bank", ["creator_id"], unique=False)
    op.create_index("ix_question_bank_difficulty", "question_bank", ["difficulty"], unique=False)
    op.create_index("ix_question_bank_id", "question_bank", ["id"], unique=False)
    op.create_index("ix_question_bank_question_type", "question_bank", ["question_type"], unique=False)

    op.create_table(
        "papers",
        sa.Column("creator_id", sa.Integer(), nullable=True),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("total_score", sa.Float(), server_default="100", nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("difficulty_ratio", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("status", sa.Enum("draft", "published", "archived", name="paper_status"), server_default="draft", nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_papers_course_id_courses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"], name=op.f("fk_papers_creator_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_papers")),
    )
    op.create_index("ix_papers_course_id", "papers", ["course_id"], unique=False)
    op.create_index("ix_papers_course_status", "papers", ["course_id", "status"], unique=False)
    op.create_index("ix_papers_created_at", "papers", ["created_at"], unique=False)
    op.create_index("ix_papers_creator_created_at", "papers", ["creator_id", "created_at"], unique=False)
    op.create_index("ix_papers_creator_id", "papers", ["creator_id"], unique=False)
    op.create_index("ix_papers_id", "papers", ["id"], unique=False)
    op.create_index("ix_papers_status", "papers", ["status"], unique=False)

    op.create_table(
        "student_tests",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(length=160), nullable=False),
        sa.Column("difficulty", sa.String(length=40), nullable=True),
        sa.Column("questions", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("answers", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("user_answers", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("status", sa.Enum("created", "started", "submitted", "graded", name="test_status"), server_default="created", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_student_tests_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_student_tests")),
    )
    op.create_index("ix_student_tests_created_at", "student_tests", ["created_at"], unique=False)
    op.create_index("ix_student_tests_difficulty", "student_tests", ["difficulty"], unique=False)
    op.create_index("ix_student_tests_id", "student_tests", ["id"], unique=False)
    op.create_index("ix_student_tests_status", "student_tests", ["status"], unique=False)
    op.create_index("ix_student_tests_topic", "student_tests", ["topic"], unique=False)
    op.create_index("ix_student_tests_user_id", "student_tests", ["user_id"], unique=False)
    op.create_index("ix_student_tests_user_status_created_at", "student_tests", ["user_id", "status", "created_at"], unique=False)

    op.create_table(
        "learning_resources",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=True),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("resource_type", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=160), nullable=True),
        sa.Column("difficulty_level", sa.String(length=40), nullable=True),
        sa.Column("tags", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("is_viewed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("user_rating", sa.Float(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_learning_resources_course_id_courses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["profile_id"], ["student_profiles.id"], name=op.f("fk_learning_resources_profile_id_student_profiles"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_learning_resources_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_learning_resources")),
    )
    op.create_index("ix_learning_resources_course_id", "learning_resources", ["course_id"], unique=False)
    op.create_index("ix_learning_resources_course_topic", "learning_resources", ["course_id", "topic"], unique=False)
    op.create_index("ix_learning_resources_created_at", "learning_resources", ["created_at"], unique=False)
    op.create_index("ix_learning_resources_difficulty_level", "learning_resources", ["difficulty_level"], unique=False)
    op.create_index("ix_learning_resources_id", "learning_resources", ["id"], unique=False)
    op.create_index("ix_learning_resources_profile_id", "learning_resources", ["profile_id"], unique=False)
    op.create_index("ix_learning_resources_resource_type", "learning_resources", ["resource_type"], unique=False)
    op.create_index("ix_learning_resources_topic", "learning_resources", ["topic"], unique=False)
    op.create_index("ix_learning_resources_user_created_at", "learning_resources", ["user_id", "created_at"], unique=False)
    op.create_index("ix_learning_resources_user_id", "learning_resources", ["user_id"], unique=False)

    op.create_table(
        "learning_paths",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("path_steps", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("current_step", sa.Integer(), server_default="0", nullable=False),
        sa.Column("completion_rate", sa.Float(), server_default="0", nullable=False),
        sa.Column("milestones", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("status", sa.Enum("active", "completed", "archived", name="learning_path_status"), server_default="active", nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["profile_id"], ["student_profiles.id"], name=op.f("fk_learning_paths_profile_id_student_profiles"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_learning_paths_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_learning_paths")),
    )
    op.create_index("ix_learning_paths_created_at", "learning_paths", ["created_at"], unique=False)
    op.create_index("ix_learning_paths_id", "learning_paths", ["id"], unique=False)
    op.create_index("ix_learning_paths_profile_id", "learning_paths", ["profile_id"], unique=False)
    op.create_index("ix_learning_paths_status", "learning_paths", ["status"], unique=False)
    op.create_index("ix_learning_paths_user_id", "learning_paths", ["user_id"], unique=False)
    op.create_index("ix_learning_paths_user_status_created_at", "learning_paths", ["user_id", "status", "created_at"], unique=False)

    op.create_table(
        "learning_assessments",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("path_id", sa.Integer(), nullable=True),
        sa.Column("assessment_type", sa.String(length=80), nullable=False),
        sa.Column("topic", sa.String(length=160), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("correct_topics", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("incorrect_topics", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("recommendations", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["path_id"], ["learning_paths.id"], name=op.f("fk_learning_assessments_path_id_learning_paths"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resource_id"], ["learning_resources.id"], name=op.f("fk_learning_assessments_resource_id_learning_resources"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_learning_assessments_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_learning_assessments")),
    )
    op.create_index("ix_learning_assessments_assessment_type", "learning_assessments", ["assessment_type"], unique=False)
    op.create_index("ix_learning_assessments_created_at", "learning_assessments", ["created_at"], unique=False)
    op.create_index("ix_learning_assessments_id", "learning_assessments", ["id"], unique=False)
    op.create_index("ix_learning_assessments_path_id", "learning_assessments", ["path_id"], unique=False)
    op.create_index("ix_learning_assessments_resource_id", "learning_assessments", ["resource_id"], unique=False)
    op.create_index("ix_learning_assessments_topic", "learning_assessments", ["topic"], unique=False)
    op.create_index("ix_learning_assessments_topic_type", "learning_assessments", ["topic", "assessment_type"], unique=False)
    op.create_index("ix_learning_assessments_user_created_at", "learning_assessments", ["user_id", "created_at"], unique=False)
    op.create_index("ix_learning_assessments_user_id", "learning_assessments", ["user_id"], unique=False)

    op.create_table(
        "paper_items",
        sa.Column("paper_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("order_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], name=op.f("fk_paper_items_paper_id_papers"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["question_bank.id"], name=op.f("fk_paper_items_question_id_question_bank"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_paper_items")),
    )
    op.create_index("ix_paper_items_created_at", "paper_items", ["created_at"], unique=False)
    op.create_index("ix_paper_items_id", "paper_items", ["id"], unique=False)
    op.create_index("ix_paper_items_paper_id", "paper_items", ["paper_id"], unique=False)
    op.create_index("ix_paper_items_paper_order", "paper_items", ["paper_id", "order_index"], unique=False)
    op.create_index("ix_paper_items_question_id", "paper_items", ["question_id"], unique=False)

    op.create_table(
        "tutoring_sessions",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("topic", sa.String(length=160), nullable=True),
        sa.Column("session_type", sa.String(length=80), server_default="qa", nullable=False),
        sa.Column("user_question", sa.Text(), nullable=False),
        sa.Column("ai_response", sa.Text(), nullable=False),
        sa.Column("response_format", sa.String(length=40), server_default="markdown", nullable=False),
        sa.Column("context_refs", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("is_helpful", sa.Boolean(), nullable=True),
        sa.Column("user_rating", sa.Float(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_tutoring_sessions_course_id_courses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_tutoring_sessions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tutoring_sessions")),
    )
    op.create_index("ix_tutoring_sessions_course_id", "tutoring_sessions", ["course_id"], unique=False)
    op.create_index("ix_tutoring_sessions_course_topic", "tutoring_sessions", ["course_id", "topic"], unique=False)
    op.create_index("ix_tutoring_sessions_created_at", "tutoring_sessions", ["created_at"], unique=False)
    op.create_index("ix_tutoring_sessions_id", "tutoring_sessions", ["id"], unique=False)
    op.create_index("ix_tutoring_sessions_topic", "tutoring_sessions", ["topic"], unique=False)
    op.create_index("ix_tutoring_sessions_user_created_at", "tutoring_sessions", ["user_id", "created_at"], unique=False)
    op.create_index("ix_tutoring_sessions_user_id", "tutoring_sessions", ["user_id"], unique=False)

    op.create_table(
        "knowledge_documents",
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("file_asset_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=80), server_default="file", nullable=False),
        sa.Column("status", sa.Enum("pending", "parsing", "ingested", "failed", "deleted", name="knowledge_document_status"), server_default="pending", nullable=False),
        sa.Column("chunk_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_knowledge_documents_course_id_courses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["file_asset_id"], ["file_assets.id"], name=op.f("fk_knowledge_documents_file_asset_id_file_assets"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_knowledge_documents_owner_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_knowledge_documents")),
    )
    op.create_index("ix_knowledge_documents_course_id", "knowledge_documents", ["course_id"], unique=False)
    op.create_index("ix_knowledge_documents_course_status", "knowledge_documents", ["course_id", "status"], unique=False)
    op.create_index("ix_knowledge_documents_created_at", "knowledge_documents", ["created_at"], unique=False)
    op.create_index("ix_knowledge_documents_file_asset_id", "knowledge_documents", ["file_asset_id"], unique=False)
    op.create_index("ix_knowledge_documents_id", "knowledge_documents", ["id"], unique=False)
    op.create_index("ix_knowledge_documents_owner_created_at", "knowledge_documents", ["owner_id", "created_at"], unique=False)
    op.create_index("ix_knowledge_documents_owner_id", "knowledge_documents", ["owner_id"], unique=False)
    op.create_index("ix_knowledge_documents_status", "knowledge_documents", ["status"], unique=False)

    op.create_table(
        "knowledge_chunks",
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("chroma_collection", sa.String(length=160), nullable=False),
        sa.Column("chroma_id", sa.String(length=160), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_knowledge_chunks_course_id_courses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], name=op.f("fk_knowledge_chunks_document_id_knowledge_documents"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_knowledge_chunks")),
        sa.UniqueConstraint("chroma_id", name=op.f("uq_knowledge_chunks_chroma_id")),
    )
    op.create_index("ix_knowledge_chunks_chroma_collection", "knowledge_chunks", ["chroma_collection"], unique=False)
    op.create_index("ix_knowledge_chunks_chroma_id", "knowledge_chunks", ["chroma_id"], unique=False)
    op.create_index("ix_knowledge_chunks_course_document", "knowledge_chunks", ["course_id", "document_id"], unique=False)
    op.create_index("ix_knowledge_chunks_course_id", "knowledge_chunks", ["course_id"], unique=False)
    op.create_index("ix_knowledge_chunks_created_at", "knowledge_chunks", ["created_at"], unique=False)
    op.create_index("ix_knowledge_chunks_document_id", "knowledge_chunks", ["document_id"], unique=False)
    op.create_index("ix_knowledge_chunks_document_index", "knowledge_chunks", ["document_id", "chunk_index"], unique=False)
    op.create_index("ix_knowledge_chunks_id", "knowledge_chunks", ["id"], unique=False)

    op.create_table(
        "generation_tasks",
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("task_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.Enum("pending", "running", "success", "failed", name="task_status"), server_default="pending", nullable=False),
        sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
        sa.Column("input_payload", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("result_artifact_id", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_generation_tasks_owner_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["result_artifact_id"], ["generated_artifacts.id"], name=op.f("fk_generation_tasks_result_artifact_id_generated_artifacts"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_generation_tasks")),
    )
    op.create_index("ix_generation_tasks_created_at", "generation_tasks", ["created_at"], unique=False)
    op.create_index("ix_generation_tasks_id", "generation_tasks", ["id"], unique=False)
    op.create_index("ix_generation_tasks_owner_id", "generation_tasks", ["owner_id"], unique=False)
    op.create_index("ix_generation_tasks_owner_status_created_at", "generation_tasks", ["owner_id", "status", "created_at"], unique=False)
    op.create_index("ix_generation_tasks_result_artifact_id", "generation_tasks", ["result_artifact_id"], unique=False)
    op.create_index("ix_generation_tasks_status", "generation_tasks", ["status"], unique=False)
    op.create_index("ix_generation_tasks_task_type", "generation_tasks", ["task_type"], unique=False)
    op.create_index("ix_generation_tasks_type_status", "generation_tasks", ["task_type", "status"], unique=False)

    op.create_table(
        "agent_runs",
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("agent_type", sa.String(length=80), nullable=False),
        sa.Column("input_payload", jsonb(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("output_payload", jsonb(), nullable=True),
        sa.Column("status", sa.Enum("pending", "running", "success", "failed", name="agent_run_status"), server_default="pending", nullable=False),
        sa.Column("trace", jsonb(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_agent_runs_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_runs")),
    )
    op.create_index("ix_agent_runs_agent_status", "agent_runs", ["agent_type", "status"], unique=False)
    op.create_index("ix_agent_runs_agent_type", "agent_runs", ["agent_type"], unique=False)
    op.create_index("ix_agent_runs_created_at", "agent_runs", ["created_at"], unique=False)
    op.create_index("ix_agent_runs_id", "agent_runs", ["id"], unique=False)
    op.create_index("ix_agent_runs_status", "agent_runs", ["status"], unique=False)
    op.create_index("ix_agent_runs_user_created_at", "agent_runs", ["user_id", "created_at"], unique=False)
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("resource_type", sa.String(length=80), nullable=True),
        sa.Column("resource_id", sa.String(length=80), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_audit_logs_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"], unique=False)
    op.create_index("ix_audit_logs_resource", "audit_logs", ["resource_type", "resource_id"], unique=False)
    op.create_index("ix_audit_logs_resource_id", "audit_logs", ["resource_id"], unique=False)
    op.create_index("ix_audit_logs_resource_type", "audit_logs", ["resource_type"], unique=False)
    op.create_index("ix_audit_logs_user_created_at", "audit_logs", ["user_id", "created_at"], unique=False)
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("agent_runs")
    op.drop_table("generation_tasks")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_documents")
    op.drop_table("tutoring_sessions")
    op.drop_table("paper_items")
    op.drop_table("learning_assessments")
    op.drop_table("learning_paths")
    op.drop_table("learning_resources")
    op.drop_table("student_tests")
    op.drop_table("papers")
    op.drop_table("question_bank")
    op.drop_table("student_profiles")
    op.drop_table("generated_artifacts")
    op.drop_table("file_assets")
    op.drop_table("courses")
    op.drop_table("users")

    for enum_name in [
        "agent_run_status",
        "task_status",
        "knowledge_document_status",
        "learning_path_status",
        "test_status",
        "paper_status",
        "artifact_status",
        "artifact_type",
        "file_parse_status",
        "user_role",
    ]:
        postgresql.ENUM(name=enum_name).drop(op.get_bind(), checkfirst=True)
