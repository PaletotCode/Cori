"""
services/notificacao_service.py — Gestão de Notificações e Gatilhos Automáticos

Responsabilidades:
  1. agendar_lembrete_sessao()  ← chamado pelo sessao_service ao criar Sessao
  2. agendar_lembrete_tarefa()  ← chamado pelo tarefa_service ao criar TarefaPaciente
  3. agendar_aviso_psicologo()  ← chamado ao confirmar sessão pelo paciente
  4. buscar_notificacoes_pendentes() ← chamado pelo worker a cada tick
  5. marcar_enviada() / marcar_falhou() ← chamado pelo worker após tentativa
"""

from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from backend.models.notificacao import NotificacaoLembrete, TipoNotificacao, StatusNotificacao
from backend.models.sessao import Sessao
from backend.models.tarefa_paciente import TarefaPaciente


# ─── Gatilhos de Criação ──────────────────────────────────────────────────────

def agendar_lembrete_sessao(db: Session, *, sessao: Sessao) -> NotificacaoLembrete | None:
    """
    Gatilho automático: chamado imediatamente após criar uma Sessão.
    Agenda um lembrete 24h antes do início.
    Retorna None se a sessão começa em menos de 24h (já seria no passado).
    """
    disparo = sessao.data_hora_inicio - timedelta(hours=24)

    if disparo <= datetime.now(timezone.utc):
        # Sessão já está a menos de 24h — não faz sentido agendar
        return None

    notif = NotificacaoLembrete(
        paciente_id=sessao.paciente_id,
        tipo=TipoNotificacao.lembrete_sessao,
        data_programada_disparo=disparo,
        status=StatusNotificacao.agendada,
        referencia_id=sessao.id,
    )
    db.add(notif)
    # Não comita aqui — o caller (sessao_service) faz o commit do bloco todo
    return notif


def agendar_lembrete_tarefa(db: Session, *, tarefa: TarefaPaciente) -> NotificacaoLembrete | None:
    """
    Gatilho automático: chamado imediatamente após criar uma TarefaPaciente.
    Agenda um lembrete 12h antes do prazo.
    Retorna None se a tarefa não tem data_vencimento ou já venceu.
    """
    if not tarefa.data_vencimento:
        return None

    disparo = tarefa.data_vencimento - timedelta(hours=12)

    if disparo <= datetime.now(timezone.utc):
        return None

    notif = NotificacaoLembrete(
        paciente_id=tarefa.paciente_id,
        tipo=TipoNotificacao.lembrete_tarefa,
        data_programada_disparo=disparo,
        status=StatusNotificacao.agendada,
        referencia_id=tarefa.id,
    )
    db.add(notif)
    return notif


def agendar_aviso_psicologo(
    db: Session,
    *,
    sessao: Sessao,
    psicologo_id: int,
) -> NotificacaoLembrete:
    """
    Chamado quando o PACIENTE confirma a sessão via notificação interativa.
    Cria imediatamente (disparo_agora) uma notificação do tipo aviso_psicologo
    para avisar o psicólogo dono da confirmação.

    Como o disparo é imediato, o worker vai processá-la no próximo tick (60 s).
    """
    notif = NotificacaoLembrete(
        # O destinatário aqui é tecnicamente o psicólogo, mas usamos paciente_id
        # como Foreign Key de segurança (ownership chain intacta).
        # O worker usa referencia_id para buscar quem enviar no momento do disparo.
        paciente_id=sessao.paciente_id,
        tipo=TipoNotificacao.aviso_psicologo,
        # Disparo imediato: agora – 1 segundo para garantir que <= now() no worker
        data_programada_disparo=datetime.now(timezone.utc) - timedelta(seconds=1),
        status=StatusNotificacao.agendada,
        referencia_id=sessao.id,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


# ─── Funções do Worker ────────────────────────────────────────────────────────

def buscar_pendentes(db: Session, limite: int = 50) -> list[NotificacaoLembrete]:
    """
    Retorna até `limite` notificações cujo horário de disparo já passou
    e ainda estão com status 'agendada'.
    O limite evita processar um backlog enorme de uma vez.
    """
    agora = datetime.now(timezone.utc)
    return (
        db.query(NotificacaoLembrete)
        .filter(
            NotificacaoLembrete.data_programada_disparo <= agora,
            NotificacaoLembrete.status == StatusNotificacao.agendada,
        )
        .order_by(NotificacaoLembrete.data_programada_disparo)
        .limit(limite)
        .all()
    )


def marcar_enviada(db: Session, notif: NotificacaoLembrete) -> None:
    notif.status = StatusNotificacao.enviada
    db.commit()


def marcar_falhou(db: Session, notif: NotificacaoLembrete) -> None:
    notif.status = StatusNotificacao.falhou
    db.commit()
