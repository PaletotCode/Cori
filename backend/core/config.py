from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# Dev fallback — SQLite absoluto (nunca usado em produção)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_URL = f"sqlite:///{_BACKEND_DIR / 'cori.db'}"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Cori API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False  # False por padrão — Railway seta explicitamente

    # Database
    # Dev:  sqlite:///./cori.db  (fallback local)
    # Prod: postgresql://user:pass@host:5432/dbname  (via Railway env var)
    DATABASE_URL: str = _DEFAULT_SQLITE_URL

    # Connection pool (ignorado pelo SQLite, activo no Postgres)
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    # JWT — OBRIGATÓRIO sobrescrever em produção
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_OPENSSL_RAND_HEX_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 dias

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""

    # CORS — em produção: lista de domínios explícitos
    CORS_ORIGINS: list[str] = ["*"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
