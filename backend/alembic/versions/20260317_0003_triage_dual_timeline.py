"""triage dual and timeline events

Revision ID: 20260317_0003
Revises: 20260317_0002
Create Date: 2026-03-17 20:05:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260317_0003"
down_revision = "20260317_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "patient_intakes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("activated_patient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mode", sa.String(length=24), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'pending_submission'"),
        ),
        sa.Column("invite_token_hash", sa.String(length=128), nullable=False),
        sa.Column("invite_token_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("invite_message", sa.String(length=500), nullable=True),
        sa.Column("custom_form", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("triage_answers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("patient_full_name", sa.String(length=180), nullable=True),
        sa.Column("patient_email", sa.String(length=255), nullable=True),
        sa.Column("patient_phone", sa.String(length=40), nullable=True),
        sa.Column("consent_terms_accepted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("consent_privacy_accepted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.String(length=500), nullable=True),
        sa.Column("complement_request_note", sa.String(length=500), nullable=True),
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
            "mode IN ('simple_invite', 'custom_triage')",
            name="ck_patient_intakes_mode",
        ),
        sa.CheckConstraint(
            "status IN ('pending_submission', 'submitted', 'complement_requested', 'approved', 'rejected', 'expired')",
            name="ck_patient_intakes_status",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_patient_intakes_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_patient_intakes_created_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_patient_intakes_reviewed_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["activated_patient_id"],
            ["patients.id"],
            ondelete="SET NULL",
            name="fk_patient_intakes_activated_patient_id_patients",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_patient_intakes"),
        sa.UniqueConstraint("invite_token_hash", name="uq_patient_intakes_invite_token_hash"),
        sa.UniqueConstraint("activated_patient_id", name="uq_patient_intakes_activated_patient_id"),
    )
    op.create_index("ix_patient_intakes_tenant_id", "patient_intakes", ["tenant_id"], unique=False)
    op.create_index("ix_patient_intakes_status", "patient_intakes", ["status"], unique=False)
    op.create_index(
        "ix_patient_intakes_invite_token_hash", "patient_intakes", ["invite_token_hash"], unique=False
    )
    op.create_index(
        "ix_patient_intakes_created_by_user_id", "patient_intakes", ["created_by_user_id"], unique=False
    )
    op.create_index(
        "ix_patient_intakes_reviewed_by_user_id", "patient_intakes", ["reviewed_by_user_id"], unique=False
    )
    op.create_index(
        "ix_patient_intakes_activated_patient_id", "patient_intakes", ["activated_patient_id"], unique=False
    )

    op.create_table(
        "timeline_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("intake_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("actor_type", sa.String(length=24), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_timeline_events_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["intake_id"],
            ["patient_intakes.id"],
            ondelete="SET NULL",
            name="fk_timeline_events_intake_id_patient_intakes",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="SET NULL",
            name="fk_timeline_events_patient_id_patients",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_timeline_events"),
    )
    op.create_index("ix_timeline_events_tenant_id", "timeline_events", ["tenant_id"], unique=False)
    op.create_index("ix_timeline_events_intake_id", "timeline_events", ["intake_id"], unique=False)
    op.create_index("ix_timeline_events_patient_id", "timeline_events", ["patient_id"], unique=False)

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE patient_intakes TO cori_app")
    op.execute("GRANT SELECT, INSERT ON TABLE timeline_events TO cori_app")

    op.execute("ALTER TABLE patient_intakes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE patient_intakes FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY patient_intakes_tenant_policy ON patient_intakes
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE timeline_events FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY timeline_events_tenant_policy ON timeline_events
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS timeline_events_tenant_policy ON timeline_events")
    op.execute("DROP POLICY IF EXISTS patient_intakes_tenant_policy ON patient_intakes")

    op.execute("REVOKE ALL PRIVILEGES ON TABLE timeline_events FROM cori_app")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE patient_intakes FROM cori_app")

    op.drop_index("ix_timeline_events_patient_id", table_name="timeline_events")
    op.drop_index("ix_timeline_events_intake_id", table_name="timeline_events")
    op.drop_index("ix_timeline_events_tenant_id", table_name="timeline_events")
    op.drop_table("timeline_events")

    op.drop_index("ix_patient_intakes_activated_patient_id", table_name="patient_intakes")
    op.drop_index("ix_patient_intakes_reviewed_by_user_id", table_name="patient_intakes")
    op.drop_index("ix_patient_intakes_created_by_user_id", table_name="patient_intakes")
    op.drop_index("ix_patient_intakes_invite_token_hash", table_name="patient_intakes")
    op.drop_index("ix_patient_intakes_status", table_name="patient_intakes")
    op.drop_index("ix_patient_intakes_tenant_id", table_name="patient_intakes")
    op.drop_table("patient_intakes")
