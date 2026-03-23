"""patient intake profile payload and oauth state

Revision ID: 20260322_0013
Revises: 20260322_0012
Create Date: 2026-03-22 21:30:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.exc import ProgrammingError

# revision identifiers, used by Alembic.
revision = "20260322_0013"
down_revision = "20260322_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "patient_intakes",
        sa.Column("patient_preferred_name", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_birth_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_pronouns", sa.String(length=60), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_emergency_contact_name", sa.String(length=180), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_emergency_contact_phone", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_communication_notes", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_profile_photo_url", sa.String(length=2048), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_profile_banner_url", sa.String(length=2048), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_oauth_google_subject", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_oauth_email", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_oauth_full_name", sa.String(length=180), nullable=True),
    )
    op.add_column(
        "patient_intakes",
        sa.Column("patient_oauth_authenticated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "patients",
        sa.Column("profile_photo_url", sa.String(length=2048), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column("profile_banner_url", sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "patient_intakes" in inspector.get_table_names():
        intake_columns = {column["name"] for column in inspector.get_columns("patient_intakes")}
        for column_name in (
            "patient_oauth_authenticated_at",
            "patient_oauth_full_name",
            "patient_oauth_email",
            "patient_oauth_google_subject",
            "patient_profile_banner_url",
            "patient_profile_photo_url",
            "patient_communication_notes",
            "patient_emergency_contact_phone",
            "patient_emergency_contact_name",
            "patient_pronouns",
            "patient_birth_date",
            "patient_preferred_name",
        ):
            if column_name in intake_columns:
                try:
                    op.drop_column("patient_intakes", column_name)
                except ProgrammingError:
                    pass

    if "patients" in inspector.get_table_names():
        patient_columns = {column["name"] for column in inspector.get_columns("patients")}
        for column_name in ("profile_banner_url", "profile_photo_url"):
            if column_name in patient_columns:
                try:
                    op.drop_column("patients", column_name)
                except ProgrammingError:
                    pass
