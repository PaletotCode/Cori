import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class StatusTarefa(str, enum.Enum):
    pendente = "pendente"
    concluida = "concluida"
    nao_realizada = "nao_realizada"


class TarefaPaciente(Base):
    """O 'Para Casa' terapêutico — tarefas atribuídas pelo psicólogo."""
    __tablename__ = "tarefas_paciente"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    paciente_id: Mapped[int] = mapped_column(
        ForeignKey("pacientes.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_vencimento: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[StatusTarefa] = mapped_column(
        Enum(StatusTarefa), nullable=False, default=StatusTarefa.pendente,
    )

    data_criacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<TarefaPaciente id={self.id} titulo={self.titulo!r} status={self.status}>"
