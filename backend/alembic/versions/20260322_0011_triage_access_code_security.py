"""triage access code security

Revision ID: 20260322_0011
Revises: 20260318_0010
Create Date: 2026-03-22 14:20:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.exc import ProgrammingError

# revision identifiers, used by Alembic.
revision = "20260322_0011"
down_revision = "20260318_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "patient_intakes",
        sa.Column("access_code_key", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("access_code_hash", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("access_code_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column(
            "access_code_attempts",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("access_code_locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("access_code_last_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "ix_patient_intakes_access_code_key",
        "patient_intakes",
        ["access_code_key"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_patient_intakes_access_code_key",
        "patient_intakes",
        ["access_code_key"],
    )

    op.alter_column(
        "patient_intakes",
        "access_code_attempts",
        server_default=None,
        existing_type=sa.Integer(),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "patient_intakes" not in inspector.get_table_names():
        return

    unique_constraints = {
        constraint["name"] for constraint in inspector.get_unique_constraints("patient_intakes")
    }
    indexes = {index["name"] for index in inspector.get_indexes("patient_intakes")}
    columns = {column["name"] for column in inspector.get_columns("patient_intakes")}

    if "uq_patient_intakes_access_code_key" in unique_constraints:
        try:
            op.drop_constraint(
                "uq_patient_intakes_access_code_key",
                "patient_intakes",
                type_="unique",
            )
        except ProgrammingError:
            pass
    if "ix_patient_intakes_access_code_key" in indexes:
        try:
            op.drop_index("ix_patient_intakes_access_code_key", table_name="patient_intakes")
        except ProgrammingError:
            pass

    if "access_code_last_attempt_at" in columns:
        try:
            op.drop_column("patient_intakes", "access_code_last_attempt_at")
        except ProgrammingError:
            pass
    if "access_code_locked_until" in columns:
        try:
            op.drop_column("patient_intakes", "access_code_locked_until")
        except ProgrammingError:
            pass
    if "access_code_attempts" in columns:
        try:
            op.drop_column("patient_intakes", "access_code_attempts")
        except ProgrammingError:
            pass
    if "access_code_expires_at" in columns:
        try:
            op.drop_column("patient_intakes", "access_code_expires_at")
        except ProgrammingError:
            pass
    if "access_code_hash" in columns:
        try:
            op.drop_column("patient_intakes", "access_code_hash")
        except ProgrammingError:
            pass
    if "access_code_key" in columns:
        try:
            op.drop_column("patient_intakes", "access_code_key")
        except ProgrammingError:
            pass
