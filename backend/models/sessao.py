import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    DateTime, Enum, ForeignKey, Numeric, String, func
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class EstadoSessao(str, enum.Enum):
    agendada = "agendada"
    confirmada = "confirmada"      # Paciente confirmou via notificação interativa
    realizada = "realizada"
    falta_cobrada = "falta_cobrada"
    cancelada_paciente = "cancelada_paciente"
    remarcada = "remarcada"

    @property
    def gera_cobranca(self) -> bool:
        """True se este estado deve ser incluído numa Fatura."""
        return self in (EstadoSessao.realizada, EstadoSessao.falta_cobrada)


class Sessao(Base):
    __tablename__ = "sessoes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    paciente_id: Mapped[int] = mapped_column(
        ForeignKey("pacientes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    data_hora_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    data_hora_fim: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    estado: Mapped[EstadoSessao] = mapped_column(
        Enum(EstadoSessao), nullable=False, default=EstadoSessao.agendada
    )

    # Herdado do paciente.valor_sessao no momento da criação, mas editável
    valor_cobrado: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # FK para Fatura — null enquanto a sessão não foi fechada num mês
    # A PRESENÇA deste FK indica que a sessão JÁ FOI FATURADA
    fatura_id: Mapped[int | None] = mapped_column(
        ForeignKey("faturas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # LPúblico: token UUID para o paciente confirmar via link (WhatsApp/Email)
    # Gerado automaticamente na criação, nunca exposto em rotas internas que não sejam
    # explicitamente o link de confirmação.
    token_confirmacao: Mapped[str] = mapped_column(
        String(36), unique=True, index=True, nullable=False,
        default=lambda: str(uuid.uuid4()),
    )

    data_criacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<Sessao id={self.id} paciente_id={self.paciente_id} "
            f"estado={self.estado} {self.data_hora_inicio}>"
        )
