"""activities engine v1

Revision ID: 20260317_0006
Revises: 20260317_0005
Create Date: 2026-03-18 00:35:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260317_0006"
down_revision = "20260317_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("psychologist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_activity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("activity_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("instructions", sa.String(length=2000), nullable=True),
        sa.Column("document_url", sa.String(length=500), nullable=True),
        sa.Column(
            "configuration",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'assigned'"),
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("overdue_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "recurrence_rule",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'none'"),
        ),
        sa.Column(
            "recurrence_interval",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("recurrence_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "execution_elapsed_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("last_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("feedback_note", sa.String(length=1000), nullable=True),
        sa.Column("patient_access_token_hash", sa.String(length=128), nullable=False),
        sa.Column("patient_access_token_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_resent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "activity_type IN ('simple_task', 'guided_meditation', 'habit', 'document_reading')",
            name="ck_activities_activity_type",
        ),
        sa.CheckConstraint(
            "status IN ('assigned', 'opened', 'in_progress', 'paused', 'completed', 'canceled', "
            "'overdue')",
            name="ck_activities_status",
        ),
        sa.CheckConstraint(
            "recurrence_rule IN ('none', 'daily', 'weekly')",
            name="ck_activities_recurrence_rule",
        ),
        sa.CheckConstraint(
            "recurrence_interval >= 1 AND recurrence_interval <= 30",
            name="ck_activities_recurrence_interval",
        ),
        sa.CheckConstraint(
            "execution_elapsed_seconds >= 0",
            name="ck_activities_execution_elapsed_seconds",
        ),
        sa.CheckConstraint(
            "activity_type <> 'document_reading' OR document_url IS NOT NULL",
            name="ck_activities_document_url_required",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_activities_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
            name="fk_activities_patient_id_patients",
        ),
        sa.ForeignKeyConstraint(
            ["psychologist_id"],
            ["psychologists.id"],
            ondelete="CASCADE",
            name="fk_activities_psychologist_id_psychologists",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_activities_created_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_activities_updated_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["source_activity_id"],
            ["activities.id"],
            ondelete="SET NULL",
            name="fk_activities_source_activity_id_activities",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_activities"),
        sa.UniqueConstraint(
            "patient_access_token_hash",
            name="uq_activities_patient_access_token_hash",
        ),
    )
    op.create_index("ix_activities_tenant_id", "activities", ["tenant_id"], unique=False)
    op.create_index("ix_activities_patient_id", "activities", ["patient_id"], unique=False)
    op.create_index(
        "ix_activities_psychologist_id",
        "activities",
        ["psychologist_id"],
        unique=False,
    )
    op.create_index(
        "ix_activities_created_by_user_id",
        "activities",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_activities_updated_by_user_id",
        "activities",
        ["updated_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_activities_source_activity_id",
        "activities",
        ["source_activity_id"],
        unique=False,
    )
    op.create_index(
        "ix_activities_patient_access_token_hash",
        "activities",
        ["patient_access_token_hash"],
        unique=False,
    )
    op.create_index("ix_activities_due_at", "activities", ["due_at"], unique=False)
    op.create_index("ix_activities_status", "activities", ["status"], unique=False)

    op.add_column(
        "timeline_events",
        sa.Column("activity_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_timeline_events_activity_id_activities",
        "timeline_events",
        "activities",
        ["activity_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_timeline_events_activity_id",
        "timeline_events",
        ["activity_id"],
        unique=False,
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE activities TO cori_app")

    op.execute("ALTER TABLE activities ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE activities FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY activities_tenant_policy ON activities
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS activities_tenant_policy ON activities")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE activities FROM cori_app")

    op.drop_index("ix_timeline_events_activity_id", table_name="timeline_events")
    op.drop_constraint(
        "fk_timeline_events_activity_id_activities",
        "timeline_events",
        type_="foreignkey",
    )
    op.drop_column("timeline_events", "activity_id")

    op.drop_index("ix_activities_status", table_name="activities")
    op.drop_index("ix_activities_due_at", table_name="activities")
    op.drop_index("ix_activities_patient_access_token_hash", table_name="activities")
    op.drop_index("ix_activities_source_activity_id", table_name="activities")
    op.drop_index("ix_activities_updated_by_user_id", table_name="activities")
    op.drop_index("ix_activities_created_by_user_id", table_name="activities")
    op.drop_index("ix_activities_psychologist_id", table_name="activities")
    op.drop_index("ix_activities_patient_id", table_name="activities")
    op.drop_index("ix_activities_tenant_id", table_name="activities")
    op.drop_table("activities")
