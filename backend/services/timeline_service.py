"""
services/timeline_service.py — Motor de Agregação (Data-Range)

Responsabilidade:
    Consulta Sessao, TarefaPaciente e CheckInDiario num intervalo data_inicio/data_fim,
    mapeia para TimelineEvent tipado e devolve lista única ordenada por data_hora ASC.

    Migração de mes/ano → data_inicio/data_fim permite scroll infinito no mobile
    e suporta transições entre meses sem lógica no cliente.
"""

from datetime import date, datetime, time, timezone
from sqlalchemy.orm import Session

from backend.models.sessao import Sessao
from backend.models.tarefa_paciente import TarefaPaciente
from backend.models.checkin_diario import CheckInDiario
from backend.models.paciente import Paciente

from backend.schemas.sessao import SessaoResponse
from backend.schemas.tarefa import TarefaResponse
from backend.schemas.checkin import CheckInResponse
from backend.schemas.timeline import (
    TimelineEventSessao,
    TimelineEventTarefa,
    TimelineEventCheckin,
    TimelineResponse,
)


def _data_to_dt(d: date, start: bool = True) -> datetime:
    """Converte date para datetime UTC (início ou fim do dia)."""
    t = time.min if start else time.max
    return datetime.combine(d, t).replace(tzinfo=timezone.utc)


def gerar_timeline(
    db: Session,
    *,
    psicologo_id: int,
    paciente_id: int,
    data_inicio: date,
    data_fim: date,
) -> TimelineResponse:
    """
    Agrega eventos de 3 fontes no intervalo [data_inicio, data_fim] (inclusive).
    Retorna TimelineResponse com lista única ordenada cronologicamente.
    Suporta janelas que cruzam meses (ex: 28/10 a 03/11).
    """
    if data_fim < data_inicio:
        raise ValueError("data_fim deve ser igual ou posterior a data_inicio.")

    # Guard de ownership
    paciente = (
        db.query(Paciente)
        .filter(Paciente.id == paciente_id, Paciente.psicologo_id == psicologo_id)
        .first()
    )
    if not paciente:
        raise ValueError("Paciente não encontrado ou não pertence ao psicólogo.")

    dt_inicio = _data_to_dt(data_inicio, start=True)
    dt_fim = _data_to_dt(data_fim, start=False)
    eventos: list = []

    # ── Fonte 1: Sessões ──────────────────────────────────────────────────────
    sessoes = (
        db.query(Sessao)
        .filter(
            Sessao.paciente_id == paciente_id,
            Sessao.data_hora_inicio >= dt_inicio,
            Sessao.data_hora_inicio <= dt_fim,
        )
        .all()
    )
    for s in sessoes:
        eventos.append(
            TimelineEventSessao(
                tipo_evento="sessao",
                data_hora=s.data_hora_inicio,
                dados_especificos=SessaoResponse.model_validate(s),
            )
        )

    # ── Fonte 2: Tarefas (âncora = data_vencimento) ───────────────────────────
    tarefas = (
        db.query(TarefaPaciente)
        .filter(
            TarefaPaciente.paciente_id == paciente_id,
            TarefaPaciente.data_vencimento.isnot(None),
            TarefaPaciente.data_vencimento >= dt_inicio,
            TarefaPaciente.data_vencimento <= dt_fim,
        )
        .all()
    )
    for t in tarefas:
        eventos.append(
            TimelineEventTarefa(
                tipo_evento="tarefa",
                data_hora=t.data_vencimento,
                dados_especificos=TarefaResponse.model_validate(t),
            )
        )

    # ── Fonte 3: Check-ins ────────────────────────────────────────────────────
    checkins = (
        db.query(CheckInDiario)
        .filter(
            CheckInDiario.paciente_id == paciente_id,
            CheckInDiario.data_registro >= dt_inicio,
            CheckInDiario.data_registro <= dt_fim,
        )
        .all()
    )
    for c in checkins:
        eventos.append(
            TimelineEventCheckin(
                tipo_evento="checkin",
                data_hora=c.data_registro,
                dados_especificos=CheckInResponse.model_validate(c),
            )
        )

    eventos.sort(key=lambda e: e.data_hora)

    return TimelineResponse(
        paciente_id=paciente_id,
        data_inicio=str(data_inicio),
        data_fim=str(data_fim),
        total_eventos=len(eventos),
        eventos=eventos,
    )
