"""persist student test generation evidence

Revision ID: 20260716_0015
Revises: 20260716_0014
"""
from alembic import op
import sqlalchemy as sa

revision = "20260716_0015"
down_revision = "20260716_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, default in (
        ("source_file_ids", "[]"), ("source_document_ids", "[]"),
        ("source_chunk_ids", "[]"), ("question_results", "[]"),
        ("generation_parameters", "{}"), ("quality_analysis", "{}"),
    ):
        op.add_column("student_tests", sa.Column(name, sa.JSON(), nullable=False, server_default=sa.text(f"'{default}'::json")))


def downgrade() -> None:
    for name in ("quality_analysis", "generation_parameters", "question_results", "source_chunk_ids", "source_document_ids", "source_file_ids"):
        op.drop_column("student_tests", name)
