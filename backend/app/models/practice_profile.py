from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PracticeProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "practice_profiles"

    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    practice_name: Mapped[str] = mapped_column(String(180), nullable=False)
    clinical_approach: Mapped[str] = mapped_column(String(120), nullable=False)
    service_modality: Mapped[str] = mapped_column(String(24), nullable=False)
    in_person_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BRL")
    late_cancellation_window_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    late_cancellation_fee_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    no_show_fee_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    notification_email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notification_whatsapp_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    notification_push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    session_reminder_hours_before: Mapped[list[int]] = mapped_column(JSONB, nullable=False)
    default_triage_mode: Mapped[str] = mapped_column(String(24), nullable=False)
    default_triage_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    tenant = relationship("Tenant", back_populates="practice_profile")
