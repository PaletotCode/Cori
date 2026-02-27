"""
main.py — Ponto de entrada da API Cori

Ciclo de vida (lifespan):
    startup  → iniciar_worker()  (APScheduler em thread daemon)
    shutdown → parar_worker()    (shutdown gracioso)

Routers registrados por domínio:
    /auth       — Autenticação Google OAuth
    /pacientes  — CRUD de pacientes (multi-tenant)
    /triagem    — Self-onboarding público + aprovação
    /sessoes    — Agenda + check-in + confirmação de paciente
    /faturas    — Motor financeiro / fecho de mês
    /anotacoes  — Prontuário clínico
    /tarefas    — Para casa terapêutico
    /checkins   — Rastreio de humor diário
    /agenda     — Super Agenda / Timeline unificada
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.worker_notificacoes import iniciar_worker, parar_worker

# Importa todos os models (registra no SQLAlchemy — Alembic é o dono do schema)
import backend.models  # noqa: F401

from backend.routes import (
    auth, pacientes, sessoes, faturas, anotacoes,
    triagem, tarefas, checkins, agenda,
)


# ─── Ciclo de Vida (APScheduler) ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager do ciclo de vida do FastAPI.
    O código antes do `yield` executa no startup;
    o código após o `yield` executa no shutdown.
    """
    iniciar_worker(intervalo_segundos=60)
    yield
    parar_worker()


# ─── Aplicação ────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "API do sistema **Cori** — gestão clínica para Psicólogos. "
        "Arquitetura multi-tenant: cada Psicólogo é um tenant isolado via JWT. "
        "Motor de notificações event-driven com APScheduler."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(pacientes.router)
app.include_router(triagem.router)
app.include_router(sessoes.router)
app.include_router(faturas.router)
app.include_router(anotacoes.router)
app.include_router(tarefas.router)
app.include_router(checkins.router)
app.include_router(agenda.router)


@app.get("/", tags=["Health"], summary="Health Check")
def health_check() -> dict:
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "worker": "running",
    }
