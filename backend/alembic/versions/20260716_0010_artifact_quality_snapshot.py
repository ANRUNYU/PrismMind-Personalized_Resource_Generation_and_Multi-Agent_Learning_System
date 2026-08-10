"""persist generated artifact quality analysis snapshot

Revision ID: 20260716_0010
Revises: 20260716_0009
"""

from alembic import op
import sqlalchemy as sa

revision = "20260716_0010"
down_revision = "20260716_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generated_artifacts", sa.Column("quality_analysis", sa.JSON(), nullable=True))
    op.add_column("learning_resources", sa.Column("quality_analysis", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("learning_resources", "quality_analysis")
    op.drop_column("generated_artifacts", "quality_analysis")
