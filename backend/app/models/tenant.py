from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Tenant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)

    users = relationship("User", back_populates="tenant")
    psychologists = relationship("Psychologist", back_populates="tenant")
    patients = relationship("Patient", back_populates="tenant")
    practice_profile = relationship("PracticeProfile", back_populates="tenant", uselist=False)
    patient_intakes = relationship("PatientIntake", back_populates="tenant")
    patient_profile_changes = relationship("PatientProfileChange", back_populates="tenant")
    sessions = relationship("Session", back_populates="tenant")
    session_reminders = relationship("SessionReminder", back_populates="tenant")
    activities = relationship("Activity", back_populates="tenant")
    clinical_forms = relationship("ClinicalForm", back_populates="tenant")
    notification_rules = relationship("NotificationRule", back_populates="tenant")
    notification_deliveries = relationship("NotificationDelivery", back_populates="tenant")
    timeline_events = relationship("TimelineEvent", back_populates="tenant")
