import enum
from datetime import date, datetime
from sqlalchemy import (
    Date, DateTime, Enum, ForeignKey,
    Integer, Numeric, String, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.sqlite import JSON
from backend.core.database import Base


class StatusPaciente(str, enum.Enum):
    pendente_aprovacao = "pendente_aprovacao"   # Novo: entrou via triagem
    ativo = "ativo"
    inativo = "inativo"
    alta = "alta"
    pausado = "pausado"


class Paciente(Base):
    __tablename__ = "pacientes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # ─── Multi-tenancy ────────────────────────────────────────────────────────
    psicologo_id: Mapped[int] = mapped_column(
        ForeignKey("psicologos.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    # ─── Perfil Básico ────────────────────────────────────────────────────────
    nome_completo: Mapped[str] = mapped_column(String(255), nullable=False)
    foto_perfil_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    pronomes_genero: Mapped[str | None] = mapped_column(String(60), nullable=True)
    data_nascimento: Mapped[date | None] = mapped_column(Date, nullable=True)
    naturalidade: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # ─── Contato ──────────────────────────────────────────────────────────────
    meios_comunicacao: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # ─── Relacionamento ───────────────────────────────────────────────────────
    estado_civil: Mapped[str | None] = mapped_column(String(60), nullable=True)
    nome_parceiro: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tempo_relacao: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # ─── Clínica ──────────────────────────────────────────────────────────────
    descricao_clinica: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_inicio_tratamento: Mapped[date | None] = mapped_column(Date, nullable=True)

    # ─── Arquivos ─────────────────────────────────────────────────────────────
    ficha_tecnica_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # ─── Logística e Financeiro ───────────────────────────────────────────────
    horario_atendimento_padrao: Mapped[str | None] = mapped_column(String(80), nullable=True)
    valor_sessao: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    dia_vencimento_pagamento: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ─── Controle ─────────────────────────────────────────────────────────────
    # "pendente_aprovacao" é o estado inicial quando o paciente entra via triagem
    status: Mapped[StatusPaciente] = mapped_column(
        Enum(StatusPaciente), default=StatusPaciente.ativo, nullable=False,
    )

    # Timestamps automáticos
    data_criacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    data_atualizacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Paciente id={self.id} nome={self.nome_completo!r} status={self.status}>"
