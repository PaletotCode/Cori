import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class TipoNotificacao(str, enum.Enum):
    lembrete_sessao = "lembrete_sessao"
    lembrete_tarefa = "lembrete_tarefa"
    cobranca = "cobranca"
    aviso_psicologo = "aviso_psicologo"   # Paciente confirmou/cancelou sessao


class StatusNotificacao(str, enum.Enum):
    agendada = "agendada"
    enviada = "enviada"
    falhou = "falhou"


class NotificacaoLembrete(Base):
    """
    Motor de disparos — agenda notificações para sessões, tarefas e cobranças.
    referencia_id aponta para o ID da Sessao ou TarefaPaciente relacionada.
    """
    __tablename__ = "notificacoes_lembretes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    paciente_id: Mapped[int] = mapped_column(
        ForeignKey("pacientes.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    tipo: Mapped[TipoNotificacao] = mapped_column(
        Enum(TipoNotificacao), nullable=False,
    )

    data_programada_disparo: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True,
    )

    status: Mapped[StatusNotificacao] = mapped_column(
        Enum(StatusNotificacao), nullable=False, default=StatusNotificacao.agendada,
    )

    # ID genérico: aponta para sessoes.id ou tarefas_paciente.id dependendo do tipo
    referencia_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    data_criacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<NotificacaoLembrete id={self.id} tipo={self.tipo} "
            f"status={self.status} disparo={self.data_programada_disparo}>"
        )
