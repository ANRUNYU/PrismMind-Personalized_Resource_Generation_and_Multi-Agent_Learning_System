"""add learning assessment submission fields

Revision ID: 20260701_0005
Revises: 20260618_0004
Create Date: 2026-07-01 00:05:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260701_0005"
down_revision: Union[str, None] = "20260618_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(postgresql.JSONB(none_as_null=True), "postgresql")


def upgrade() -> None:
    json_default = sa.text("'{}'::jsonb") if op.get_bind().dialect.name == "postgresql" else sa.text("'{}'")
    op.add_column("learning_assessments", sa.Column("test_id", sa.Integer(), nullable=True))
    op.add_column("learning_assessments", sa.Column("answers", _json_type(), server_default=json_default, nullable=False))
    op.add_column("learning_assessments", sa.Column("reflection", sa.Text(), nullable=True))
    op.add_column("learning_assessments", sa.Column("self_rating", sa.Float(), nullable=True))
    op.add_column("learning_assessments", sa.Column("feedback", sa.Text(), nullable=True))
    op.add_column("learning_assessments", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_learning_assessments_test_id_student_tests"),
        "learning_assessments",
        "student_tests",
        ["test_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_learning_assessments_test_id", "learning_assessments", ["test_id"], unique=False)
    op.alter_column("learning_assessments", "answers", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_learning_assessments_test_id", table_name="learning_assessments")
    op.drop_constraint(op.f("fk_learning_assessments_test_id_student_tests"), "learning_assessments", type_="foreignkey")
    op.drop_column("learning_assessments", "submitted_at")
    op.drop_column("learning_assessments", "feedback")
    op.drop_column("learning_assessments", "self_rating")
    op.drop_column("learning_assessments", "reflection")
    op.drop_column("learning_assessments", "answers")
    op.drop_column("learning_assessments", "test_id")
