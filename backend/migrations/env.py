"""
Alembic env.py — configurado para o projeto Cori.

Integração com:
- SQLAlchemy Base dos models (autogenerate de migrations)
- DATABASE_URL lido do .env via core.config.Settings
- Suporte a SQLite (dev) e PostgreSQL (produção) sem mudança de código
"""

import sys
import os
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context

# ─── Garante que o pacote /backend está no sys.path ──────────────────────────
# Necessário para importar backend.core, backend.models, etc.
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent  # → /Documents/Cori
sys.path.insert(0, str(BACKEND_ROOT))

# ─── Imports do projeto ───────────────────────────────────────────────────────
from backend.core.config import settings  # noqa: E402
from backend.core.database import Base    # noqa: E402
import backend.models                     # noqa: F401, E402 — registra todos os models

# ─── Config do Alembic ────────────────────────────────────────────────────────
config = context.config

# Sobrescreve a URL com o valor real do .env (ignora o valor comentado no .ini)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Setup de logging conforme definido no alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata alvo para geração automática de migrations
target_metadata = Base.metadata


# ─── Modo Offline (gera SQL sem conectar ao banco) ───────────────────────────
def run_migrations_offline() -> None:
    """
    Útil para gerar scripts SQL para revisão antes de aplicar.
    Executa: alembic upgrade head --sql > migration.sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Para SQLite: não emite DROP de constraints (não suportado nativamente)
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


# ─── Modo Online (conecta ao banco e aplica direto) ──────────────────────────
def run_migrations_online() -> None:
    """
    Modo padrão. Conecta ao banco (SQLite ou Postgres) e aplica as migrations.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        is_sqlite = settings.DATABASE_URL.startswith("sqlite")
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # render_as_batch é obrigatório para ALTER TABLE no SQLite
            render_as_batch=is_sqlite,
            compare_type=True,   # Detecta mudanças de tipo de coluna
            compare_server_default=True,  # Detecta mudanças de valores default
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
