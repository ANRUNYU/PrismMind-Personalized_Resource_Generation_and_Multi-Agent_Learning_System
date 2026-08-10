"""add task streaming snapshot fields

Revision ID: 20260716_0008
Revises: 20260716_0007
"""

from alembic import op
import sqlalchemy as sa

revision = "20260716_0008"
down_revision = "20260716_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("generation_tasks") as batch:
        batch.add_column(sa.Column("current_stage", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("status_message", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("partial_content", sa.Text(), nullable=True))
        batch.add_column(
            sa.Column(
                "result_payload",
                sa.JSON(),
                server_default=sa.text("'{}'::json"),
                nullable=False,
            )
        )
        batch.add_column(sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("generation_tasks") as batch:
        batch.drop_column("finished_at")
        batch.drop_column("started_at")
        batch.drop_column("result_payload")
        batch.drop_column("partial_content")
        batch.drop_column("status_message")
        batch.drop_column("current_stage")
