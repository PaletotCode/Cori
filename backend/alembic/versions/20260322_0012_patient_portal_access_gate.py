"""patient portal access gate

Revision ID: 20260322_0012
Revises: 20260322_0011
Create Date: 2026-03-22 18:05:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.exc import ProgrammingError

# revision identifiers, used by Alembic.
revision = "20260322_0012"
down_revision = "20260322_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("portal_access_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column("portal_access_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_patients_portal_access_token_hash",
        "patients",
        ["portal_access_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "patients" not in inspector.get_table_names():
        return

    indexes = {index["name"] for index in inspector.get_indexes("patients")}
    columns = {column["name"] for column in inspector.get_columns("patients")}

    if "ix_patients_portal_access_token_hash" in indexes:
        try:
            op.drop_index("ix_patients_portal_access_token_hash", table_name="patients")
        except ProgrammingError:
            pass

    if "portal_access_token_expires_at" in columns:
        try:
            op.drop_column("patients", "portal_access_token_expires_at")
        except ProgrammingError:
            pass

    if "portal_access_token_hash" in columns:
        try:
            op.drop_column("patients", "portal_access_token_hash")
        except ProgrammingError:
            pass
