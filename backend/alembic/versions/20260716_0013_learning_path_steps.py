"""normalize learning path steps and test provenance

Revision ID: 20260716_0013
Revises: 20260716_0012
"""
from alembic import op
import sqlalchemy as sa

revision = "20260716_0013"; down_revision = "20260716_0012"; branch_labels = None; depends_on = None

def upgrade() -> None:
    op.add_column("learning_paths", sa.Column("profile_snapshot", sa.JSON(), nullable=True))
    op.create_table("learning_path_steps",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("learning_path_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False), sa.Column("title", sa.String(255), nullable=False),
        sa.Column("knowledge_point", sa.String(255), nullable=False), sa.Column("description", sa.Text(), nullable=False),
        sa.Column("learning_objectives", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("estimated_minutes", sa.Integer(), nullable=False), sa.Column("status", sa.String(32), nullable=False, server_default="locked"),
        sa.Column("study_completed_at", sa.DateTime(timezone=True)), sa.Column("step_test_id", sa.Integer()),
        sa.Column("pass_score", sa.Float(), nullable=False, server_default="60"), sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unlocked_at", sa.DateTime(timezone=True)), sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["learning_path_id"], ["learning_paths.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("learning_path_id", "position", name="uq_learning_path_step_position"))
    op.create_index("ix_learning_path_steps_learning_path_id", "learning_path_steps", ["learning_path_id"])
    op.create_index("ix_learning_path_steps_path_status", "learning_path_steps", ["learning_path_id", "status"])
    for name, target in [("learning_path_id", "learning_paths.id"), ("learning_path_step_id", "learning_path_steps.id"), ("resource_id", "learning_resources.id")]:
        op.add_column("student_tests", sa.Column(name, sa.Integer(), nullable=True))
        op.create_foreign_key(f"fk_student_tests_{name}", "student_tests", target.split('.')[0], [name], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_student_tests_{name}", "student_tests", [name])
    op.add_column("student_tests", sa.Column("source_type", sa.String(40), nullable=True))
    op.add_column("student_tests", sa.Column("evidence_snapshot", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")))
    op.create_index("ix_student_tests_source_type", "student_tests", ["source_type"])
    op.create_foreign_key("fk_learning_path_steps_step_test", "learning_path_steps", "student_tests", ["step_test_id"], ["id"], ondelete="SET NULL", use_alter=True)
    # Existing JSON paths remain readable; application lazily materializes them on first access.

def downgrade() -> None:
    op.drop_constraint("fk_learning_path_steps_step_test", "learning_path_steps", type_="foreignkey")
    op.drop_index("ix_student_tests_source_type", table_name="student_tests"); op.drop_column("student_tests", "evidence_snapshot"); op.drop_column("student_tests", "source_type")
    for name in ("resource_id", "learning_path_step_id", "learning_path_id"):
        op.drop_index(f"ix_student_tests_{name}", table_name="student_tests"); op.drop_constraint(f"fk_student_tests_{name}", "student_tests", type_="foreignkey"); op.drop_column("student_tests", name)
    op.drop_table("learning_path_steps"); op.drop_column("learning_paths", "profile_snapshot")
