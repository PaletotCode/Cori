"""core auth multitenancy rls

Revision ID: 20260317_0001
Revises: 
Create Date: 2026-03-17 18:20:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260317_0001"
down_revision = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id", name="pk_tenants"),
        sa.UniqueConstraint("name", name="uq_tenants_name"),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=180), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_users_tenant_id_tenants"),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.create_table(
        "psychologists",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(length=180), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_psychologists_tenant_id_tenants"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_psychologists_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_psychologists"),
        sa.UniqueConstraint("user_id", name="uq_psychologists_user_id"),
    )
    op.create_index("ix_psychologists_tenant_id", "psychologists", ["tenant_id"], unique=False)
    op.create_index("ix_psychologists_user_id", "psychologists", ["user_id"], unique=False)

    op.create_table(
        "patients",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(length=180), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_patients_tenant_id_tenants"),
        sa.PrimaryKeyConstraint("id", name="pk_patients"),
    )
    op.create_index("ix_patients_tenant_id", "patients", ["tenant_id"], unique=False)

    op.create_table(
        "auth_refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_auth_refresh_tokens_tenant_id_tenants"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_auth_refresh_tokens_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_auth_refresh_tokens"),
    )
    op.create_index("ix_auth_refresh_tokens_tenant_id", "auth_refresh_tokens", ["tenant_id"], unique=False)
    op.create_index("ix_auth_refresh_tokens_user_id", "auth_refresh_tokens", ["user_id"], unique=False)

    op.execute("CREATE SCHEMA IF NOT EXISTS app")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cori_app') THEN
                CREATE ROLE cori_app NOLOGIN NOSUPERUSER NOBYPASSRLS INHERIT;
            END IF;
        END
        $$;
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO cori_app")
    op.execute("GRANT USAGE ON SCHEMA app TO cori_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenants TO cori_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO cori_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE psychologists TO cori_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE patients TO cori_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth_refresh_tokens TO cori_app")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION app.current_tenant_uuid()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
        $$;
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION app.rls_bypass_enabled()
        RETURNS boolean
        LANGUAGE sql
        STABLE
        AS $$
          SELECT COALESCE(NULLIF(current_setting('app.rls_bypass', true), ''), 'off') = 'on';
        $$;
        """
    )

    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY users_tenant_policy ON users
        USING (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        WITH CHECK (app.rls_bypass_enabled() OR tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE psychologists ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE psychologists FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY psychologists_tenant_policy ON psychologists
        USING (tenant_id = app.current_tenant_uuid())
        WITH CHECK (tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE patients ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE patients FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY patients_tenant_policy ON patients
        USING (tenant_id = app.current_tenant_uuid())
        WITH CHECK (tenant_id = app.current_tenant_uuid())
        """
    )

    op.execute("ALTER TABLE auth_refresh_tokens ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE auth_refresh_tokens FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY auth_refresh_tokens_tenant_policy ON auth_refresh_tokens
        USING (tenant_id = app.current_tenant_uuid())
        WITH CHECK (tenant_id = app.current_tenant_uuid())
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cori_app') THEN
                REVOKE ALL PRIVILEGES ON TABLE auth_refresh_tokens FROM cori_app;
                REVOKE ALL PRIVILEGES ON TABLE patients FROM cori_app;
                REVOKE ALL PRIVILEGES ON TABLE psychologists FROM cori_app;
                REVOKE ALL PRIVILEGES ON TABLE users FROM cori_app;
                REVOKE ALL PRIVILEGES ON TABLE tenants FROM cori_app;
                REVOKE USAGE ON SCHEMA app FROM cori_app;
                REVOKE USAGE ON SCHEMA public FROM cori_app;
                DROP ROLE cori_app;
            END IF;
        END
        $$;
        """
    )

    op.execute("DROP POLICY IF EXISTS auth_refresh_tokens_tenant_policy ON auth_refresh_tokens")
    op.execute("DROP POLICY IF EXISTS patients_tenant_policy ON patients")
    op.execute("DROP POLICY IF EXISTS psychologists_tenant_policy ON psychologists")
    op.execute("DROP POLICY IF EXISTS users_tenant_policy ON users")

    op.execute("DROP FUNCTION IF EXISTS app.rls_bypass_enabled")
    op.execute("DROP FUNCTION IF EXISTS app.current_tenant_uuid")

    op.drop_index("ix_auth_refresh_tokens_user_id", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_tenant_id", table_name="auth_refresh_tokens")
    op.drop_table("auth_refresh_tokens")

    op.drop_index("ix_patients_tenant_id", table_name="patients")
    op.drop_table("patients")

    op.drop_index("ix_psychologists_user_id", table_name="psychologists")
    op.drop_index("ix_psychologists_tenant_id", table_name="psychologists")
    op.drop_table("psychologists")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_table("users")

    op.drop_table("tenants")
