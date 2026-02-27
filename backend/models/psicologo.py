import secrets
import string
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


def _gerar_slug(length: int = 10) -> str:
    """Gera um slug URL-safe único de `length` caracteres."""
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class Psicologo(Base):
    __tablename__ = "psicologos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Identity via Google OAuth
    google_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)

    # Perfil personalizável (independente do Google)
    nome_exibicao: Mapped[str | None] = mapped_column(String(120), nullable=True)
    foto_perfil_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Self-Onboarding: URL pública para formulário de triagem do paciente.
    # Gerado automaticamente no upsert; pode ser regenerado pelo psicólogo.
    # Exemplo de URL: https://cori.app/triagem/{slug_link_publico}
    slug_link_publico: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, nullable=True,
        default=_gerar_slug,
    )

    # Push Notifications: token do dispositivo (Expo/FCM)
    # Atualizado pelo app sempre que o psicólogo faz login ou o token muda.
    dispositivo_push_token: Mapped[str | None] = mapped_column(
        String(256), nullable=True
    )

    data_criacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Psicologo id={self.id} email={self.email!r} slug={self.slug_link_publico!r}>"
