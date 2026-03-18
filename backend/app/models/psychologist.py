from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Psychologist(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "psychologists"

    tenant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    display_name: Mapped[str] = mapped_column(String(180), nullable=False)

    tenant = relationship("Tenant", back_populates="psychologists")
    user = relationship("User", back_populates="psychologist")
    sessions = relationship("Session", back_populates="psychologist")
    activities = relationship("Activity", back_populates="psychologist")
    clinical_forms = relationship("ClinicalForm", back_populates="psychologist")
