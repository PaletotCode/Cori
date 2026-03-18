"""sessions agenda realtime reminders

Revision ID: 20260317_0005
Revises: 20260317_0004
Create Date: 2026-03-17 23:59:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260317_0005"
down_revision = "20260317_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("psychologist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scheduled_start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'scheduled'"),
        ),
        sa.Column(
            "location_mode",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'online'"),
        ),
        sa.Column("meeting_link", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("cancellation_reason", sa.String(length=500), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by", sa.String(length=24), nullable=True),
        sa.Column("rescheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmation_token_hash", sa.String(length=128), nullable=False),
        sa.Column("confirmation_token_expires_at", sa.DateTime(timezone=True), nullable=False),
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
            "status IN ('scheduled', 'confirmed', 'rescheduled', 'canceled', 'completed')",
            name="ck_sessions_status",
        ),
        sa.CheckConstraint(
            "location_mode IN ('online', 'presential', 'hybrid')",
            name="ck_sessions_location_mode",
        ),
        sa.CheckConstraint(
            "confirmed_by IS NULL OR confirmed_by IN ('patient', 'psychologist')",
            name="ck_sessions_confirmed_by",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_sessions_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
            name="fk_sessions_patient_id_patients",
        ),
        sa.ForeignKeyConstraint(
            ["psychologist_id"],
            ["psychologists.id"],
            ondelete="CASCADE",
            name="fk_sessions_psychologist_id_psychologists",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_sessions_created_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_sessions_updated_by_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
        sa.UniqueConstraint("confirmation_token_hash", name="uq_sessions_confirmation_token_hash"),
    )
    op.create_index("ix_sessions_tenant_id", "sessions", ["tenant_id"], unique=False)
    op.create_index("ix_sessions_patient_id", "sessions", ["patient_id"], unique=False)
    op.create_index("ix_sessions_psychologist_id", "sessions", ["psychologist_id"], unique=False)
    op.create_index(
        "ix_sessions_created_by_user_id", "sessions", ["created_by_user_id"], unique=False
    )
    op.create_index(
        "ix_sessions_updated_by_user_id", "sessions", ["updated_by_user_id"], unique=False
    )
    op.create_index(
        "ix_sessions_confirmation_token_hash",
        "sessions",
        ["confirmation_token_hash"],
        unique=False,
    )
    op.create_index(
        "ix_sessions_scheduled_start_at", "sessions", ["scheduled_start_at"], unique=False
    )

    op.create_table(
        "session_reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reminder_hours_before", sa.Integer(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_reason", sa.String(length=500), nullable=True),
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
            "status IN ('queued', 'sent', 'failed')",
            name="ck_session_reminders_status",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_session_reminders_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["sessions.id"],
            ondelete="CASCADE",
            name="fk_session_reminders_session_id_sessions",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
            name="fk_session_reminders_patient_id_patients",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_session_reminders"),
        sa.UniqueConstraint(
            "session_id",
            "reminder_hours_before",
            name="uq_session_reminders_session_id",
        ),
    )
    op.create_index("ix_session_reminders_tenant_id", "session_reminders", ["tenant_id"], unique=False)
    op.create_index("ix_session_reminders_session_id", "session_reminders", ["session_id"], unique=False)
    op.create_index("ix_session_reminders_patient_id", "session_reminders", ["patient_id"], unique=False)
    op.create_index(
        "ix_session_reminders_scheduled_for", "session_reminders", ["scheduled_for"], unique=False
    )

    op.add_column("timeline_events", sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_timeline_events_session_id_sessions",
        "timeline_events",
        "sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_timeline_events_session_id", "timeline_events", ["session_id"], unique=False)

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sessions TO cori_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE session_reminders TO cori_app")

    op.execute("ALTER TABLE sessions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sessions FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY sessions_tenant_policy ON sessions
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE session_reminders ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE session_reminders FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY session_reminders_tenant_policy ON session_reminders
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS session_reminders_tenant_policy ON session_reminders")
    op.execute("DROP POLICY IF EXISTS sessions_tenant_policy ON sessions")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE session_reminders FROM cori_app")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE sessions FROM cori_app")

    op.drop_index("ix_timeline_events_session_id", table_name="timeline_events")
    op.drop_constraint("fk_timeline_events_session_id_sessions", "timeline_events", type_="foreignkey")
    op.drop_column("timeline_events", "session_id")

    op.drop_index("ix_session_reminders_scheduled_for", table_name="session_reminders")
    op.drop_index("ix_session_reminders_patient_id", table_name="session_reminders")
    op.drop_index("ix_session_reminders_session_id", table_name="session_reminders")
    op.drop_index("ix_session_reminders_tenant_id", table_name="session_reminders")
    op.drop_table("session_reminders")

    op.drop_index("ix_sessions_scheduled_start_at", table_name="sessions")
    op.drop_index("ix_sessions_confirmation_token_hash", table_name="sessions")
    op.drop_index("ix_sessions_updated_by_user_id", table_name="sessions")
    op.drop_index("ix_sessions_created_by_user_id", table_name="sessions")
    op.drop_index("ix_sessions_psychologist_id", table_name="sessions")
    op.drop_index("ix_sessions_patient_id", table_name="sessions")
    op.drop_index("ix_sessions_tenant_id", table_name="sessions")
    op.drop_table("sessions")
