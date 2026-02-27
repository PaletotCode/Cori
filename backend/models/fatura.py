import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    Date, DateTime, Enum, ForeignKey, Integer, Numeric, func
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class EstadoFatura(str, enum.Enum):
    pendente = "pendente"
    paga = "paga"
    atrasada = "atrasada"
    cancelada = "cancelada"


class Fatura(Base):
    __tablename__ = "faturas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    paciente_id: Mapped[int] = mapped_column(
        ForeignKey("pacientes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    mes_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)

    # Calculado no momento da geração; recalculado ao PATCH /pagar se necessário
    valor_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    estado: Mapped[EstadoFatura] = mapped_column(
        Enum(EstadoFatura), nullable=False, default=EstadoFatura.pendente
    )

    data_vencimento: Mapped[datetime] = mapped_column(Date, nullable=False)
    # Null enquanto não paga; preenchido pelo endpoint /pagar
    data_pagamento: Mapped[datetime | None] = mapped_column(Date, nullable=True)

    data_criacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<Fatura id={self.id} paciente_id={self.paciente_id} "
            f"{self.mes_referencia}/{self.ano_referencia} estado={self.estado}>"
        )
