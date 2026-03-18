"""practice profile onboarding

Revision ID: 20260317_0002
Revises: 20260317_0001
Create Date: 2026-03-17 19:30:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260317_0002"
down_revision = "20260317_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "practice_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("practice_name", sa.String(length=180), nullable=False),
        sa.Column("clinical_approach", sa.String(length=120), nullable=False),
        sa.Column("service_modality", sa.String(length=24), nullable=False),
        sa.Column("in_person_address", sa.String(length=255), nullable=True),
        sa.Column("session_price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default=sa.text("'BRL'")),
        sa.Column("late_cancellation_window_hours", sa.Integer(), nullable=False),
        sa.Column("late_cancellation_fee_percent", sa.Integer(), nullable=False),
        sa.Column("no_show_fee_percent", sa.Integer(), nullable=False),
        sa.Column(
            "notification_email_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "notification_whatsapp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "notification_push_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("session_reminder_hours_before", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("default_triage_mode", sa.String(length=24), nullable=False),
        sa.Column("default_triage_message", sa.String(length=500), nullable=True),
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
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
            "service_modality IN ('online', 'presential', 'hybrid')",
            name="ck_practice_profiles_service_modality",
        ),
        sa.CheckConstraint(
            "default_triage_mode IN ('standard', 'custom')",
            name="ck_practice_profiles_default_triage_mode",
        ),
        sa.CheckConstraint(
            "session_price_cents >= 0 AND session_price_cents <= 1000000",
            name="ck_practice_profiles_session_price_cents",
        ),
        sa.CheckConstraint(
            "late_cancellation_window_hours >= 1 AND late_cancellation_window_hours <= 168",
            name="ck_practice_profiles_late_cancel_window",
        ),
        sa.CheckConstraint(
            "late_cancellation_fee_percent >= 0 AND late_cancellation_fee_percent <= 100",
            name="ck_practice_profiles_late_cancel_fee_percent",
        ),
        sa.CheckConstraint(
            "no_show_fee_percent >= 0 AND no_show_fee_percent <= 100",
            name="ck_practice_profiles_no_show_fee_percent",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_practice_profiles_tenant_id_tenants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_practice_profiles"),
        sa.UniqueConstraint("tenant_id", name="uq_practice_profiles_tenant_id"),
    )
    op.create_index("ix_practice_profiles_tenant_id", "practice_profiles", ["tenant_id"], unique=False)

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE practice_profiles TO cori_app")

    op.execute("ALTER TABLE practice_profiles ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE practice_profiles FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY practice_profiles_tenant_policy ON practice_profiles
        USING (tenant_id = app.current_tenant_uuid())
        WITH CHECK (tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS practice_profiles_tenant_policy ON practice_profiles")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE practice_profiles FROM cori_app")

    op.drop_index("ix_practice_profiles_tenant_id", table_name="practice_profiles")
    op.drop_table("practice_profiles")
