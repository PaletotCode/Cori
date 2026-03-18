from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PatientIntake(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "patient_intakes"

    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reviewed_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    activated_patient_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )

    mode: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    invite_token_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True, index=True
    )
    invite_token_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    invite_message: Mapped[str | None] = mapped_column(String(500), nullable=True)

    custom_form: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    triage_answers: Mapped[dict[str, str] | None] = mapped_column(JSONB, nullable=True)

    patient_full_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    patient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    patient_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    consent_terms_accepted: Mapped[bool] = mapped_column(nullable=False, default=False)
    consent_privacy_accepted: Mapped[bool] = mapped_column(nullable=False, default=False)

    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    complement_request_note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    tenant = relationship("Tenant", back_populates="patient_intakes")
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    reviewed_by_user = relationship("User", foreign_keys=[reviewed_by_user_id])
    activated_patient = relationship("Patient", foreign_keys=[activated_patient_id])
    timeline_events = relationship("TimelineEvent", back_populates="intake")
