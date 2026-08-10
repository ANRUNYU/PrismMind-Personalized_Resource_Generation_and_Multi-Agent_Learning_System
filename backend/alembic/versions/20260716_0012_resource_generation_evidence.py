"""persist resource generation evidence

Revision ID: 20260716_0012
Revises: 20260716_0011
"""

from alembic import op
import sqlalchemy as sa

revision = "20260716_0012"
down_revision = "20260716_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("learning_resources", sa.Column("profile_snapshot", sa.JSON(), nullable=True))
    op.add_column("learning_resources", sa.Column("reference_snapshot", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")))
    op.add_column("learning_resources", sa.Column("generation_task_id", sa.Integer(), nullable=True))
    op.add_column("learning_resources", sa.Column("generation_parameters", sa.JSON(), nullable=True))
    op.create_foreign_key(
        "fk_learning_resources_generation_task_id_tasks",
        "learning_resources", "generation_tasks", ["generation_task_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_learning_resources_generation_task_id", "learning_resources", ["generation_task_id"])


def downgrade() -> None:
    op.drop_index("ix_learning_resources_generation_task_id", table_name="learning_resources")
    op.drop_constraint("fk_learning_resources_generation_task_id_tasks", "learning_resources", type_="foreignkey")
    op.drop_column("learning_resources", "generation_parameters")
    op.drop_column("learning_resources", "generation_task_id")
    op.drop_column("learning_resources", "reference_snapshot")
    op.drop_column("learning_resources", "profile_snapshot")
