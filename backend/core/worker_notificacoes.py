"""
core/worker_notificacoes.py — APScheduler Background Worker

Arquitetura:
    APScheduler BackgroundScheduler (thread separada, não bloqueia o event loop)
    vs BackgroundTasks do FastAPI (por-request, morre com o request) →
    APScheduler é a escolha correta para um cron genuíno em MVP.

    Para escalar a produção (múltiplas instâncias):
    → Trocar BackgroundScheduler por APScheduler com JobStoreRedis + lock distribuído
    → Ou migrar para Celery Beat + Redis Broker

Ciclo de vida:
    FastAPI lifespan() → iniciar_worker() → job a cada 60 s → parar_worker()

Segurança da Session:
    O worker cria sua própria SessionLocal() por execução de job.
    NUNCA compartilha Session com os request handlers — thread-safe.
"""

import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler

from backend.core.database import SessionLocal
from backend.core.push_sender import send_push, send_push_to_psicologo, PushSendError
from backend.models.notificacao import TipoNotificacao
from backend.models.sessao import Sessao
from backend.models.paciente import Paciente
from backend.models.psicologo import Psicologo
from backend.services import notificacao_service

logger = logging.getLogger(__name__)

# Instância singleton do scheduler — criada uma vez, compartilhada
_scheduler = BackgroundScheduler(
    job_defaults={"coalesce": True, "max_instances": 1},
    timezone="UTC",
)


def _processar_notificacoes() -> None:
    """
    Job executado a cada 60 segundos.
    Busca notificações pendentes, resolve o destinatário e token,
    chama send_push() e atualiza o status no banco.

    Isolamento de Session: cada execução abre e fecha sua própria sessão.
    """
    db = SessionLocal()
    try:
        pendentes = notificacao_service.buscar_pendentes(db, limite=50)

        if not pendentes:
            return

        logger.info("Worker: %d notificação(ões) para processar.", len(pendentes))

        for notif in pendentes:
            try:
                enviado = _despachar(db, notif)
                if enviado:
                    notificacao_service.marcar_enviada(db, notif)
                else:
                    # Token ausente não é falha técnica — marca como enviada para não reprocessar
                    notificacao_service.marcar_enviada(db, notif)

            except PushSendError as e:
                logger.error("Worker: falha ao enviar notif id=%d — %s", notif.id, e)
                notificacao_service.marcar_falhou(db, notif)

            except Exception as e:
                logger.exception("Worker: erro inesperado na notif id=%d — %s", notif.id, e)
                notificacao_service.marcar_falhou(db, notif)

    finally:
        db.close()


def _despachar(db, notif) -> bool:
    """
    Resolve o token de destino e o conteúdo da notificação com base no tipo.
    Retorna True se tentou enviar, False se pulou por falta de token.
    """
    paciente: Paciente | None = db.query(Paciente).filter(Paciente.id == notif.paciente_id).first()
    if not paciente:
        return False

    # ── Lembrete de Sessão → notifica PACIENTE ────────────────────────────────
    if notif.tipo == TipoNotificacao.lembrete_sessao:
        sessao: Sessao | None = db.query(Sessao).filter(Sessao.id == notif.referencia_id).first()
        hora = sessao.data_hora_inicio.strftime("%d/%m %H:%M") if sessao else "em breve"
        return send_push(
            token=paciente.dispositivo_push_token or "",
            title="🗓️ Lembrete de Sessão",
            body=f"Sua sessão é amanhã às {hora}. Confirme sua presença!",
            data={"tipo": "lembrete_sessao", "sessao_id": notif.referencia_id},
        )

    # ── Lembrete de Tarefa → notifica PACIENTE ────────────────────────────────
    elif notif.tipo == TipoNotificacao.lembrete_tarefa:
        return send_push(
            token=paciente.dispositivo_push_token or "",
            title="📋 Tarefa Pendente",
            body="Você tem uma tarefa vencendo em 12 horas. Não esqueça!",
            data={"tipo": "lembrete_tarefa", "tarefa_id": notif.referencia_id},
        )

    # ── Aviso ao Psicólogo → notifica PSICÓLOGO ──────────────────────────────
    elif notif.tipo == TipoNotificacao.aviso_psicologo:
        psicologo: Psicologo | None = db.query(Psicologo).filter(
            Psicologo.id == paciente.psicologo_id
        ).first()
        if not psicologo:
            return False

        sessao: Sessao | None = db.query(Sessao).filter(Sessao.id == notif.referencia_id).first()
        hora = sessao.data_hora_inicio.strftime("%d/%m %H:%M") if sessao else "?"
        return send_push_to_psicologo(
            psicologo_token=psicologo.dispositivo_push_token,
            title="✅ Sessão Confirmada",
            body=f"{paciente.nome_completo} confirmou a sessão de {hora}.",
            data={"tipo": "aviso_psicologo", "sessao_id": notif.referencia_id,
                  "paciente_id": paciente.id},
        )

    # ── Cobrança → notifica PACIENTE (placeholder) ────────────────────────────
    elif notif.tipo == TipoNotificacao.cobranca:
        return send_push(
            token=paciente.dispositivo_push_token or "",
            title="💳 Fatura Disponível",
            body="Sua fatura do mês está disponível. Verifique no app.",
            data={"tipo": "cobranca", "fatura_id": notif.referencia_id},
        )

    return False


# ─── API Pública do Worker ────────────────────────────────────────────────────

def iniciar_worker(intervalo_segundos: int = 60) -> None:
    """Inicia o scheduler com o job de notificações. Chamado no lifespan do FastAPI."""
    _scheduler.add_job(
        _processar_notificacoes,
        trigger="interval",
        seconds=intervalo_segundos,
        id="worker_notificacoes",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("🚀 Worker de notificações iniciado (intervalo=%ds).", intervalo_segundos)


def parar_worker() -> None:
    """Para o scheduler graciosamente. Chamado no lifespan do FastAPI."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("🛑 Worker de notificações encerrado.")
