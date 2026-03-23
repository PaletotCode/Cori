from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Patient(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "patients"

    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    preferred_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    pronouns: Mapped[str | None] = mapped_column(String(60), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    preferred_contact_channel: Mapped[str] = mapped_column(
        String(24), nullable=False, default="whatsapp"
    )
    preferred_contact_period: Mapped[str | None] = mapped_column(String(24), nullable=True)
    communication_notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    profile_photo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    profile_banner_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    profile_source: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    portal_access_token_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        unique=True,
        index=True,
    )
    portal_access_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    tenant = relationship("Tenant", back_populates="patients")
    activation_intake = relationship(
        "PatientIntake",
        back_populates="activated_patient",
        uselist=False,
    )
    profile_changes = relationship("PatientProfileChange", back_populates="patient")
    sessions = relationship("Session", back_populates="patient")
    activities = relationship("Activity", back_populates="patient")
    clinical_forms = relationship("ClinicalForm", back_populates="patient")
    notification_rules = relationship("NotificationRule", back_populates="patient")
    notification_deliveries = relationship("NotificationDelivery", back_populates="patient")
