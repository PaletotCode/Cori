"""panel card preferences

Revision ID: 20260318_0009
Revises: 20260318_0008
Create Date: 2026-03-18 15:10:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260318_0009"
down_revision = "20260318_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dashboard_card_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("card_key", sa.String(length=64), nullable=False),
        sa.Column("carousel_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "display_mode",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'dynamic'"),
        ),
        sa.Column(
            "fixed_item",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'yesterday'"),
        ),
        sa.Column(
            "display_order",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[\"yesterday\",\"weekAgo\",\"monthAgo\"]'::jsonb"),
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
            "card_key IN ('sessions_today', 'pending_confirmation', 'weekly_revenue_forecast')",
            name="ck_dashboard_card_preferences_card_key",
        ),
        sa.CheckConstraint(
            "display_mode IN ('dynamic', 'fixed')",
            name="ck_dashboard_card_preferences_display_mode",
        ),
        sa.CheckConstraint(
            "fixed_item IN ('yesterday', 'weekAgo', 'monthAgo')",
            name="ck_dashboard_card_preferences_fixed_item",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_dashboard_card_preferences_tenant_id_tenants",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_dashboard_card_preferences_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_card_preferences"),
        sa.UniqueConstraint(
            "tenant_id",
            "user_id",
            "card_key",
            name="uq_dashboard_card_preferences_scope",
        ),
    )
    op.create_index(
        "ix_dashboard_card_preferences_tenant_id",
        "dashboard_card_preferences",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_dashboard_card_preferences_user_id",
        "dashboard_card_preferences",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_dashboard_card_preferences_card_key",
        "dashboard_card_preferences",
        ["card_key"],
        unique=False,
    )

    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dashboard_card_preferences TO cori_app"
    )
    op.execute("ALTER TABLE dashboard_card_preferences ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE dashboard_card_preferences FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY dashboard_card_preferences_tenant_policy
        ON dashboard_card_preferences
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS dashboard_card_preferences_tenant_policy "
        "ON dashboard_card_preferences"
    )
    op.execute("REVOKE ALL PRIVILEGES ON TABLE dashboard_card_preferences FROM cori_app")
    op.drop_index("ix_dashboard_card_preferences_card_key", table_name="dashboard_card_preferences")
    op.drop_index("ix_dashboard_card_preferences_user_id", table_name="dashboard_card_preferences")
    op.drop_index("ix_dashboard_card_preferences_tenant_id", table_name="dashboard_card_preferences")
    op.drop_table("dashboard_card_preferences")
