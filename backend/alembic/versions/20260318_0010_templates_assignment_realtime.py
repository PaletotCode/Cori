"""templates assignment realtime flow

Revision ID: 20260318_0010
Revises: 20260318_0009
Create Date: 2026-03-18 17:30:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260318_0010"
down_revision = "20260318_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activity_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("psychologist_id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.Column("activity_type", sa.String(length=32), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
            name="ck_activity_templates_activity_type",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_activity_templates_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["psychologist_id"],
            ["psychologists.id"],
            ondelete="CASCADE",
            name="fk_activity_templates_psychologist_id_psychologists",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_activity_templates"),
    )
    op.create_index(
        "ix_activity_templates_tenant_id",
        "activity_templates",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_activity_templates_psychologist_id",
        "activity_templates",
        ["psychologist_id"],
        unique=False,
    )
    op.create_index(
        "ix_activity_templates_updated_at",
        "activity_templates",
        ["updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_activity_templates_archived_at",
        "activity_templates",
        ["archived_at"],
        unique=False,
    )

    op.create_table(
        "form_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("psychologist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("subtitle", sa.String(length=300), nullable=True),
        sa.Column("header", sa.String(length=1500), nullable=True),
        sa.Column(
            "builder_schema",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_form_templates_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["psychologist_id"],
            ["psychologists.id"],
            ondelete="CASCADE",
            name="fk_form_templates_psychologist_id_psychologists",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_form_templates"),
    )
    op.create_index(
        "ix_form_templates_tenant_id",
        "form_templates",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_form_templates_psychologist_id",
        "form_templates",
        ["psychologist_id"],
        unique=False,
    )
    op.create_index(
        "ix_form_templates_updated_at",
        "form_templates",
        ["updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_form_templates_archived_at",
        "form_templates",
        ["archived_at"],
        unique=False,
    )

    op.add_column(
        "activities",
        sa.Column("source_template_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_activities_source_template_id_activity_templates",
        "activities",
        "activity_templates",
        ["source_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_activities_source_template_id",
        "activities",
        ["source_template_id"],
        unique=False,
    )

    op.add_column(
        "activities",
        sa.Column("scheduled_send_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_activities_scheduled_send_at",
        "activities",
        ["scheduled_send_at"],
        unique=False,
    )

    op.execute("ALTER TABLE activities DROP CONSTRAINT IF EXISTS ck_activities_status")
    op.execute("ALTER TABLE activities DROP CONSTRAINT IF EXISTS ck_activities_ck_activities_status")
    op.execute(
        """
        UPDATE activities
        SET status = 'assigned'
        WHERE status = 'scheduled'
        """
    )
    op.execute(
        """
        ALTER TABLE activities
        ADD CONSTRAINT ck_activities_status
        CHECK (
            status IN (
                'scheduled', 'assigned', 'opened', 'in_progress',
                'paused', 'completed', 'canceled', 'overdue'
            )
        )
        """
    )

    op.add_column(
        "clinical_forms",
        sa.Column("source_template_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_clinical_forms_source_template_id_form_templates",
        "clinical_forms",
        "form_templates",
        ["source_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_clinical_forms_source_template_id",
        "clinical_forms",
        ["source_template_id"],
        unique=False,
    )

    op.create_table(
        "assignment_idempotency_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("operation", sa.String(length=120), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=128), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            "resource_type IN ('activity', 'form')",
            name="ck_assignment_idempotency_resource_type",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_assignment_idempotency_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_assignment_idempotency_created_by_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assignment_idempotency_keys"),
        sa.UniqueConstraint(
            "tenant_id",
            "operation",
            "idempotency_key",
            name="uq_assignment_idempotency_scope_key",
        ),
    )
    op.create_index(
        "ix_assignment_idempotency_keys_tenant_id",
        "assignment_idempotency_keys",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_assignment_idempotency_keys_created_by_user_id",
        "assignment_idempotency_keys",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_assignment_idempotency_keys_resource_id",
        "assignment_idempotency_keys",
        ["resource_id"],
        unique=False,
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE activity_templates TO cori_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE form_templates TO cori_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assignment_idempotency_keys TO cori_app"
    )

    op.execute("ALTER TABLE activity_templates ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE activity_templates FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY activity_templates_tenant_policy ON activity_templates
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE form_templates FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY form_templates_tenant_policy ON form_templates
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE assignment_idempotency_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE assignment_idempotency_keys FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY assignment_idempotency_keys_tenant_policy
        ON assignment_idempotency_keys
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS assignment_idempotency_keys_tenant_policy "
        "ON assignment_idempotency_keys"
    )
    op.execute("DROP POLICY IF EXISTS form_templates_tenant_policy ON form_templates")
    op.execute("DROP POLICY IF EXISTS activity_templates_tenant_policy ON activity_templates")

    op.execute("REVOKE ALL PRIVILEGES ON TABLE assignment_idempotency_keys FROM cori_app")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE form_templates FROM cori_app")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE activity_templates FROM cori_app")

    op.drop_index(
        "ix_assignment_idempotency_keys_resource_id",
        table_name="assignment_idempotency_keys",
    )
    op.drop_index(
        "ix_assignment_idempotency_keys_created_by_user_id",
        table_name="assignment_idempotency_keys",
    )
    op.drop_index(
        "ix_assignment_idempotency_keys_tenant_id",
        table_name="assignment_idempotency_keys",
    )
    op.drop_table("assignment_idempotency_keys")

    op.drop_index("ix_clinical_forms_source_template_id", table_name="clinical_forms")
    op.drop_constraint(
        "fk_clinical_forms_source_template_id_form_templates",
        "clinical_forms",
        type_="foreignkey",
    )
    op.drop_column("clinical_forms", "source_template_id")

    op.execute("ALTER TABLE activities DROP CONSTRAINT IF EXISTS ck_activities_status")
    op.execute("ALTER TABLE activities DROP CONSTRAINT IF EXISTS ck_activities_ck_activities_status")
    op.execute("UPDATE activities SET status = 'assigned' WHERE status = 'scheduled'")
    op.execute(
        """
        ALTER TABLE activities
        ADD CONSTRAINT ck_activities_status
        CHECK (
            status IN (
                'assigned', 'opened', 'in_progress',
                'paused', 'completed', 'canceled', 'overdue'
            )
        )
        """
    )

    op.drop_index("ix_activities_scheduled_send_at", table_name="activities")
    op.drop_column("activities", "scheduled_send_at")

    op.drop_index("ix_activities_source_template_id", table_name="activities")
    op.drop_constraint(
        "fk_activities_source_template_id_activity_templates",
        "activities",
        type_="foreignkey",
    )
    op.drop_column("activities", "source_template_id")

    op.drop_index("ix_form_templates_archived_at", table_name="form_templates")
    op.drop_index("ix_form_templates_updated_at", table_name="form_templates")
    op.drop_index("ix_form_templates_psychologist_id", table_name="form_templates")
    op.drop_index("ix_form_templates_tenant_id", table_name="form_templates")
    op.drop_table("form_templates")

    op.drop_index("ix_activity_templates_archived_at", table_name="activity_templates")
    op.drop_index("ix_activity_templates_updated_at", table_name="activity_templates")
    op.drop_index("ix_activity_templates_psychologist_id", table_name="activity_templates")
    op.drop_index("ix_activity_templates_tenant_id", table_name="activity_templates")
    op.drop_table("activity_templates")
