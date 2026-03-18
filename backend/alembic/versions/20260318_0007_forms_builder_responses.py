"""forms builder responses

Revision ID: 20260318_0007
Revises: 20260317_0006
Create Date: 2026-03-18 01:55:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260318_0007"
down_revision = "20260317_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "clinical_forms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("psychologist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("subtitle", sa.String(length=300), nullable=True),
        sa.Column("header", sa.String(length=1500), nullable=True),
        sa.Column(
            "builder_schema",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("response_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_send_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("partial_saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.String(length=1000), nullable=True),
        sa.Column("patient_access_token_hash", sa.String(length=128), nullable=False),
        sa.Column("patient_access_token_expires_at", sa.DateTime(timezone=True), nullable=False),
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
            "status IN ('draft', 'published', 'scheduled', 'assigned', 'opened', "
            "'partial_saved', 'submitted', 'reviewed')",
            name="ck_clinical_forms_status",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_clinical_forms_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
            name="fk_clinical_forms_patient_id_patients",
        ),
        sa.ForeignKeyConstraint(
            ["psychologist_id"],
            ["psychologists.id"],
            ondelete="CASCADE",
            name="fk_clinical_forms_psychologist_id_psychologists",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_clinical_forms_created_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_clinical_forms_updated_by_user_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_clinical_forms_reviewed_by_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_clinical_forms"),
        sa.UniqueConstraint(
            "patient_access_token_hash",
            name="uq_clinical_forms_patient_access_token_hash",
        ),
    )
    op.create_index("ix_clinical_forms_tenant_id", "clinical_forms", ["tenant_id"], unique=False)
    op.create_index("ix_clinical_forms_patient_id", "clinical_forms", ["patient_id"], unique=False)
    op.create_index(
        "ix_clinical_forms_psychologist_id",
        "clinical_forms",
        ["psychologist_id"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_forms_created_by_user_id",
        "clinical_forms",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_forms_updated_by_user_id",
        "clinical_forms",
        ["updated_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_forms_reviewed_by_user_id",
        "clinical_forms",
        ["reviewed_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_forms_patient_access_token_hash",
        "clinical_forms",
        ["patient_access_token_hash"],
        unique=False,
    )
    op.create_index("ix_clinical_forms_status", "clinical_forms", ["status"], unique=False)
    op.create_index(
        "ix_clinical_forms_scheduled_send_at",
        "clinical_forms",
        ["scheduled_send_at"],
        unique=False,
    )

    op.add_column(
        "timeline_events",
        sa.Column("form_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_timeline_events_form_id_clinical_forms",
        "timeline_events",
        "clinical_forms",
        ["form_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_timeline_events_form_id", "timeline_events", ["form_id"], unique=False)

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clinical_forms TO cori_app")

    op.execute("ALTER TABLE clinical_forms ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE clinical_forms FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY clinical_forms_tenant_policy ON clinical_forms
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS clinical_forms_tenant_policy ON clinical_forms")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE clinical_forms FROM cori_app")

    op.drop_index("ix_timeline_events_form_id", table_name="timeline_events")
    op.drop_constraint(
        "fk_timeline_events_form_id_clinical_forms",
        "timeline_events",
        type_="foreignkey",
    )
    op.drop_column("timeline_events", "form_id")

    op.drop_index("ix_clinical_forms_scheduled_send_at", table_name="clinical_forms")
    op.drop_index("ix_clinical_forms_status", table_name="clinical_forms")
    op.drop_index(
        "ix_clinical_forms_patient_access_token_hash",
        table_name="clinical_forms",
    )
    op.drop_index("ix_clinical_forms_reviewed_by_user_id", table_name="clinical_forms")
    op.drop_index("ix_clinical_forms_updated_by_user_id", table_name="clinical_forms")
    op.drop_index("ix_clinical_forms_created_by_user_id", table_name="clinical_forms")
    op.drop_index("ix_clinical_forms_psychologist_id", table_name="clinical_forms")
    op.drop_index("ix_clinical_forms_patient_id", table_name="clinical_forms")
    op.drop_index("ix_clinical_forms_tenant_id", table_name="clinical_forms")
    op.drop_table("clinical_forms")
