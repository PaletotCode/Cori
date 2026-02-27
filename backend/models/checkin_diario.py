from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class CheckInDiario(Base):
    """
    Rastreio de humor diário do paciente.
    nivel_humor: 1 (muito ruim) → 5 (excelente).
    nivel_ansiedade: 1 (nenhuma) → 10 (extrema).
    """
    __tablename__ = "checkins_diarios"

    # CheckConstraints garantem integridade dos intervalos numéricos no banco
    __table_args__ = (
        CheckConstraint("nivel_humor >= 1 AND nivel_humor <= 5", name="ck_humor_range"),
        CheckConstraint("nivel_ansiedade >= 1 AND nivel_ansiedade <= 10", name="ck_ansiedade_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    paciente_id: Mapped[int] = mapped_column(
        ForeignKey("pacientes.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    data_registro: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True,
    )

    nivel_humor: Mapped[int] = mapped_column(Integer, nullable=False)
    nivel_ansiedade: Mapped[int] = mapped_column(Integer, nullable=False)
    anotacao_paciente: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<CheckInDiario id={self.id} paciente_id={self.paciente_id} "
            f"humor={self.nivel_humor} ansiedade={self.nivel_ansiedade}>"
        )
