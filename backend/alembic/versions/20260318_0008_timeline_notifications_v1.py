"""timeline notifications v1

Revision ID: 20260318_0008
Revises: 20260318_0007
Create Date: 2026-03-18 11:20:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260318_0008"
down_revision = "20260318_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notification_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "event_category",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'all'"),
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("inbox_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("push_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "realtime_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("quiet_hours_start", sa.Integer(), nullable=True),
        sa.Column("quiet_hours_end", sa.Integer(), nullable=True),
        sa.Column(
            "max_notifications_per_hour",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("20"),
        ),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            "event_category IN ('all', 'sessions', 'activities', 'forms', "
            "'documents', 'notifications', 'app_usage')",
            name="ck_notification_rules_event_category",
        ),
        sa.CheckConstraint(
            "quiet_hours_start IS NULL OR (quiet_hours_start >= 0 AND quiet_hours_start <= 23)",
            name="ck_notification_rules_quiet_hours_start",
        ),
        sa.CheckConstraint(
            "quiet_hours_end IS NULL OR (quiet_hours_end >= 0 AND quiet_hours_end <= 23)",
            name="ck_notification_rules_quiet_hours_end",
        ),
        sa.CheckConstraint(
            "max_notifications_per_hour >= 1 AND max_notifications_per_hour <= 120",
            name="ck_notification_rules_max_per_hour",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_notification_rules_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
            name="fk_notification_rules_patient_id_patients",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_notification_rules_created_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_notification_rules_updated_by_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_notification_rules"),
        sa.UniqueConstraint(
            "tenant_id",
            "patient_id",
            "event_category",
            name="uq_notification_rules_scope",
        ),
    )
    op.create_index(
        "ix_notification_rules_tenant_id",
        "notification_rules",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_rules_patient_id",
        "notification_rules",
        ["patient_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_rules_created_by_user_id",
        "notification_rules",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_rules_updated_by_user_id",
        "notification_rules",
        ["updated_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_rules_event_category",
        "notification_rules",
        ["event_category"],
        unique=False,
    )

    op.create_table(
        "notification_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("body", sa.String(length=1000), nullable=False),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column("status_reason", sa.String(length=500), nullable=True),
        sa.Column("channel_inbox", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("channel_push", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "channel_realtime",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("action_taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('queued', 'sent', 'delivered', 'opened', 'action_taken', 'failed')",
            name="ck_notification_deliveries_status",
        ),
        sa.CheckConstraint(
            "category IN ('sessions', 'activities', 'forms', 'documents', "
            "'notifications', 'app_usage')",
            name="ck_notification_deliveries_category",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_notification_deliveries_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
            name="fk_notification_deliveries_patient_id_patients",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_notification_deliveries"),
    )
    op.create_index(
        "ix_notification_deliveries_tenant_id",
        "notification_deliveries",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_patient_id",
        "notification_deliveries",
        ["patient_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_status",
        "notification_deliveries",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_category",
        "notification_deliveries",
        ["category"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_created_at",
        "notification_deliveries",
        ["created_at"],
        unique=False,
    )

    op.add_column(
        "timeline_events",
        sa.Column("notification_delivery_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_timeline_events_notification_delivery",
        "timeline_events",
        "notification_deliveries",
        ["notification_delivery_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_timeline_events_notification_delivery_id",
        "timeline_events",
        ["notification_delivery_id"],
        unique=False,
    )

    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_rules TO cori_app"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_deliveries TO cori_app"
    )

    op.execute("ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE notification_rules FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY notification_rules_tenant_policy ON notification_rules
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY notification_deliveries_tenant_policy ON notification_deliveries
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS notification_deliveries_tenant_policy ON notification_deliveries"
    )
    op.execute(
        "DROP POLICY IF EXISTS notification_rules_tenant_policy ON notification_rules"
    )
    op.execute("REVOKE ALL PRIVILEGES ON TABLE notification_deliveries FROM cori_app")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE notification_rules FROM cori_app")

    op.drop_index(
        "ix_timeline_events_notification_delivery_id",
        table_name="timeline_events",
    )
    op.drop_constraint(
        "fk_timeline_events_notification_delivery",
        "timeline_events",
        type_="foreignkey",
    )
    op.drop_column("timeline_events", "notification_delivery_id")

    op.drop_index(
        "ix_notification_deliveries_created_at",
        table_name="notification_deliveries",
    )
    op.drop_index("ix_notification_deliveries_category", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_status", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_patient_id", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_tenant_id", table_name="notification_deliveries")
    op.drop_table("notification_deliveries")

    op.drop_index("ix_notification_rules_event_category", table_name="notification_rules")
    op.drop_index("ix_notification_rules_updated_by_user_id", table_name="notification_rules")
    op.drop_index("ix_notification_rules_created_by_user_id", table_name="notification_rules")
    op.drop_index("ix_notification_rules_patient_id", table_name="notification_rules")
    op.drop_index("ix_notification_rules_tenant_id", table_name="notification_rules")
    op.drop_table("notification_rules")
