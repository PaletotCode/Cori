from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DashboardCardPreference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "dashboard_card_preferences"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "user_id",
            "card_key",
            name="uq_dashboard_card_preferences_scope",
        ),
    )

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
        index=True,
    )
    card_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    carousel_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="dynamic")
    fixed_item: Mapped[str] = mapped_column(String(16), nullable=False, default="yesterday")
    display_order: Mapped[list[str]] = mapped_column(JSONB, nullable=False)

    tenant = relationship("Tenant", back_populates="dashboard_card_preferences")
    user = relationship("User", back_populates="dashboard_card_preferences")
