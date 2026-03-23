"""patient intake auth user binding

Revision ID: 20260322_0014
Revises: 20260322_0013
Create Date: 2026-03-22 23:10:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import ProgrammingError

# revision identifiers, used by Alembic.
revision = "20260322_0014"
down_revision = "20260322_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "patient_intakes",
        sa.Column(
            "patient_auth_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_patient_intakes_patient_auth_user_id",
        "patient_intakes",
        ["patient_auth_user_id"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "patient_intakes" not in inspector.get_table_names():
        return

    existing_indexes = {index["name"] for index in inspector.get_indexes("patient_intakes")}
    if "ix_patient_intakes_patient_auth_user_id" in existing_indexes:
        try:
            op.drop_index(
                "ix_patient_intakes_patient_auth_user_id",
                table_name="patient_intakes",
            )
        except ProgrammingError:
            pass

    existing_columns = {column["name"] for column in inspector.get_columns("patient_intakes")}
    if "patient_auth_user_id" in existing_columns:
        try:
            op.drop_column("patient_intakes", "patient_auth_user_id")
        except ProgrammingError:
            pass
