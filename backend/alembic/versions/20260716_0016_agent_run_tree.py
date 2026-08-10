"""add multi-agent run tree diagnostics

Revision ID: 20260716_0016
Revises: 20260716_0015
"""
from alembic import op
import sqlalchemy as sa

revision = "20260716_0016"
down_revision = "20260716_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("parent_run_id", sa.Integer(), nullable=True))
    op.add_column("agent_runs", sa.Column("run_uuid", sa.String(36), nullable=True))
    op.add_column("agent_runs", sa.Column("model_name", sa.String(160), nullable=True))
    op.add_column("agent_runs", sa.Column("provider", sa.String(80), nullable=True))
    op.add_column("agent_runs", sa.Column("token_usage", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")))
    op.add_column("agent_runs", sa.Column("evidence_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("agent_runs", sa.Column("verifier_decision", sa.String(40), nullable=True))
    op.add_column("agent_runs", sa.Column("latency_ms", sa.Integer(), nullable=True))
    op.add_column("agent_runs", sa.Column("error_message", sa.String(1000), nullable=True))
    op.execute("UPDATE agent_runs SET run_uuid = id::text WHERE run_uuid IS NULL")
    op.alter_column("agent_runs", "run_uuid", nullable=False)
    op.create_unique_constraint("uq_agent_runs_run_uuid", "agent_runs", ["run_uuid"])
    op.create_index("ix_agent_runs_run_uuid", "agent_runs", ["run_uuid"], unique=True)
    op.create_index("ix_agent_runs_parent_run_id", "agent_runs", ["parent_run_id"], unique=False)
    op.create_foreign_key("fk_agent_runs_parent_run_id_agent_runs", "agent_runs", "agent_runs", ["parent_run_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint("fk_agent_runs_parent_run_id_agent_runs", "agent_runs", type_="foreignkey")
    op.drop_index("ix_agent_runs_parent_run_id", table_name="agent_runs")
    op.drop_index("ix_agent_runs_run_uuid", table_name="agent_runs")
    op.drop_constraint("uq_agent_runs_run_uuid", "agent_runs", type_="unique")
    for name in ("error_message", "latency_ms", "verifier_decision", "evidence_count", "token_usage", "provider", "model_name", "run_uuid", "parent_run_id"):
        op.drop_column("agent_runs", name)
