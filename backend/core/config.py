from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# Diretório raiz do pacote backend/ — usado para resolver o caminho do SQLite
# de forma absoluta e independente do CWD de quem chama (uvicorn, alembic, pytest)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_URL = f"sqlite:///{_BACKEND_DIR / 'cori.db'}"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Cori API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    # Dev: SQLite com caminho absoluto (não depende do CWD)
    # Prod: sobrescreva no .env com DATABASE_URL=postgresql://...
    DATABASE_URL: str = _DEFAULT_SQLITE_URL

    # JWT
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_OPENSSL_RAND_HEX_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 dias

    # Google OAuth
    # Deixe vazio ("") para usar o modo dev (mock).
    # Em produção: cole o Client ID do Google Cloud Console.
    GOOGLE_CLIENT_ID: str = ""

    # CORS - Em produção, coloque o domínio real do frontend
    CORS_ORIGINS: list[str] = ["*"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
