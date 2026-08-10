"""add persistent tutoring conversations

Revision ID: 20260716_0014
Revises: 20260716_0013
"""
from alembic import op
import sqlalchemy as sa

revision="20260716_0014"; down_revision="20260716_0013"; branch_labels=None; depends_on=None

def upgrade() -> None:
    op.create_table("tutoring_conversations",
        sa.Column("id",sa.Integer(),primary_key=True), sa.Column("user_id",sa.Integer(),nullable=False),
        sa.Column("course_id",sa.Integer()), sa.Column("title",sa.String(255),nullable=False),
        sa.Column("created_at",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
        sa.Column("updated_at",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"],["users.id"],ondelete="CASCADE"), sa.ForeignKeyConstraint(["course_id"],["courses.id"],ondelete="SET NULL"))
    op.create_index("ix_tutoring_conversations_user_id","tutoring_conversations",["user_id"])
    op.create_index("ix_tutoring_conversations_course_id","tutoring_conversations",["course_id"])
    op.create_index("ix_tutoring_conversations_user_updated","tutoring_conversations",["user_id","updated_at"])
    op.create_table("tutoring_messages",
        sa.Column("id",sa.Integer(),primary_key=True), sa.Column("conversation_id",sa.Integer(),nullable=False),
        sa.Column("role",sa.String(24),nullable=False), sa.Column("content",sa.Text(),nullable=False,server_default=""),
        sa.Column("status",sa.String(24),nullable=False,server_default="completed"), sa.Column("references",sa.JSON(),nullable=False,server_default=sa.text("'[]'::json")),
        sa.Column("warnings",sa.JSON(),nullable=False,server_default=sa.text("'[]'::json")), sa.Column("error",sa.Text()),
        sa.Column("client_message_id",sa.String(100)), sa.Column("created_at",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
        sa.Column("updated_at",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["conversation_id"],["tutoring_conversations.id"],ondelete="CASCADE"),
        sa.UniqueConstraint("conversation_id","client_message_id",name="uq_tutoring_message_client_key"))
    op.create_index("ix_tutoring_messages_conversation_id","tutoring_messages",["conversation_id"])
    op.create_index("ix_tutoring_messages_conversation_created","tutoring_messages",["conversation_id","created_at"])
    # Legacy tutoring_sessions stays intact and remains available through compatibility endpoints.

def downgrade() -> None:
    op.drop_table("tutoring_messages"); op.drop_table("tutoring_conversations")
