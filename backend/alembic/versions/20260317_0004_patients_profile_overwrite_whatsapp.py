"""patients profile, overwrite history and whatsapp support

Revision ID: 20260317_0004
Revises: 20260317_0003
Create Date: 2026-03-17 23:10:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260317_0004"
down_revision = "20260317_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("preferred_name", sa.String(length=120), nullable=True))
    op.add_column("patients", sa.Column("phone", sa.String(length=40), nullable=True))
    op.add_column("patients", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("patients", sa.Column("pronouns", sa.String(length=60), nullable=True))
    op.add_column(
        "patients", sa.Column("emergency_contact_name", sa.String(length=180), nullable=True)
    )
    op.add_column(
        "patients", sa.Column("emergency_contact_phone", sa.String(length=40), nullable=True)
    )
    op.add_column(
        "patients",
        sa.Column(
            "preferred_contact_channel",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'whatsapp'"),
        ),
    )
    op.add_column(
        "patients", sa.Column("preferred_contact_period", sa.String(length=24), nullable=True)
    )
    op.add_column(
        "patients", sa.Column("communication_notes", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "patients",
        sa.Column(
            "profile_source",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
    )
    op.add_column("patients", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "patients", sa.Column("archived_by_user_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_patients_archived_by_user_id_users",
        "patients",
        "users",
        ["archived_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_patients_archived_by_user_id", "patients", ["archived_by_user_id"], unique=False)
    op.create_check_constraint(
        "ck_patients_preferred_contact_channel",
        "patients",
        "preferred_contact_channel IN ('whatsapp', 'email', 'phone')",
    )
    op.create_check_constraint(
        "ck_patients_preferred_contact_period",
        "patients",
        "preferred_contact_period IS NULL OR preferred_contact_period IN ('morning', 'afternoon', 'night', 'flexible')",
    )
    op.create_check_constraint(
        "ck_patients_profile_source",
        "patients",
        "profile_source IN ('manual', 'intake')",
    )

    op.create_table(
        "patient_profile_changes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("changed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("change_type", sa.String(length=24), nullable=False),
        sa.Column(
            "changed_fields",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("previous_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "change_type IN ('created', 'updated', 'overwritten', 'archived')",
            name="ck_patient_profile_changes_change_type",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_patient_profile_changes_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
            name="fk_patient_profile_changes_patient_id_patients",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_patient_profile_changes_changed_by_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_patient_profile_changes"),
    )
    op.create_index(
        "ix_patient_profile_changes_tenant_id", "patient_profile_changes", ["tenant_id"], unique=False
    )
    op.create_index(
        "ix_patient_profile_changes_patient_id", "patient_profile_changes", ["patient_id"], unique=False
    )
    op.create_index(
        "ix_patient_profile_changes_changed_by_user_id",
        "patient_profile_changes",
        ["changed_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_patient_profile_changes_created_at", "patient_profile_changes", ["created_at"], unique=False
    )

    op.execute("GRANT SELECT, INSERT ON TABLE patient_profile_changes TO cori_app")

    op.execute("ALTER TABLE patient_profile_changes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE patient_profile_changes FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY patient_profile_changes_tenant_policy ON patient_profile_changes
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS patient_profile_changes_tenant_policy ON patient_profile_changes"
    )
    op.execute("REVOKE ALL PRIVILEGES ON TABLE patient_profile_changes FROM cori_app")

    op.drop_index("ix_patient_profile_changes_created_at", table_name="patient_profile_changes")
    op.drop_index(
        "ix_patient_profile_changes_changed_by_user_id", table_name="patient_profile_changes"
    )
    op.drop_index("ix_patient_profile_changes_patient_id", table_name="patient_profile_changes")
    op.drop_index("ix_patient_profile_changes_tenant_id", table_name="patient_profile_changes")
    op.drop_table("patient_profile_changes")

    op.drop_constraint("ck_patients_profile_source", "patients", type_="check")
    op.drop_constraint("ck_patients_preferred_contact_period", "patients", type_="check")
    op.drop_constraint("ck_patients_preferred_contact_channel", "patients", type_="check")
    op.drop_index("ix_patients_archived_by_user_id", table_name="patients")
    op.drop_constraint("fk_patients_archived_by_user_id_users", "patients", type_="foreignkey")
    op.drop_column("patients", "archived_by_user_id")
    op.drop_column("patients", "archived_at")
    op.drop_column("patients", "profile_source")
    op.drop_column("patients", "communication_notes")
    op.drop_column("patients", "preferred_contact_period")
    op.drop_column("patients", "preferred_contact_channel")
    op.drop_column("patients", "emergency_contact_phone")
    op.drop_column("patients", "emergency_contact_name")
    op.drop_column("patients", "pronouns")
    op.drop_column("patients", "birth_date")
    op.drop_column("patients", "phone")
    op.drop_column("patients", "preferred_name")
