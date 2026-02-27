import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class TipoAnotacao(str, enum.Enum):
    evolucao_oficial = "evolucao_oficial"
    notas_pessoais = "notas_pessoais"


class AnotacaoClinica(Base):
    __tablename__ = "anotacoes_clinicas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    paciente_id: Mapped[int] = mapped_column(
        ForeignKey("pacientes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # One-to-One: cada sessão realizada pode ter UMA anotação clínica associada.
    # unique=True garante a constraint no banco.
    sessao_id: Mapped[int] = mapped_column(
        ForeignKey("sessoes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # SEGURANÇA FUTURA: Este campo deve ser encriptado em repouso antes de ir
    # para produção com dados reais. Recomenda-se AES-256-GCM via sqlalchemy-utils
    # EncryptedType ou encriptação a nível de aplicação com cryptography (Fernet)
    # ANTES de salvar, e decriptação ao ler. A chave de encriptação deve vir do
    # Vault / Secret Manager, NUNCA do .env ou do código-fonte.
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)

    tipo: Mapped[TipoAnotacao] = mapped_column(
        Enum(TipoAnotacao), nullable=False, default=TipoAnotacao.evolucao_oficial
    )

    data_registo: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<AnotacaoClinica id={self.id} sessao_id={self.sessao_id} "
            f"tipo={self.tipo}>"
        )
