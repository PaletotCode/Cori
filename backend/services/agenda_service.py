"""
services/agenda_service.py — Agenda Geral do Psicólogo

Responsabilidade:
    Agrega eventos de TODOS os pacientes do psicólogo numa janela de datas.
    Cada evento inclui um mini-perfil do paciente (id, nome, foto) para
    que o frontend renderize diretamente sem queries adicionais.
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


def _data_to_dt(d: date, start: bool = True) -> datetime:
    """Converte date para datetime UTC (meia-noite início ou fim do dia)."""
    t = time.min if start else time.max
    return datetime.combine(d, t).replace(tzinfo=timezone.utc)


def gerar_agenda_geral(
    db: Session,
    *,
    psicologo_id: int,
    data_inicio: date,
    data_fim: date,
    tipos: list[str] | None = None,
) -> dict:
    """
    Varre todos os pacientes do psicólogo e agrega seus eventos no intervalo.
    Retorna uma lista única ordenada cronologicamente com mini-perfil do paciente.
    """
    if data_fim < data_inicio:
        raise ValueError("data_fim deve ser igual ou posterior a data_inicio.")

    dt_inicio = _data_to_dt(data_inicio, start=True)
    dt_fim = _data_to_dt(data_fim, start=False)

    # IDs de todos os pacientes do psicólogo
    pacientes = (
        db.query(Paciente)
        .filter(Paciente.psicologo_id == psicologo_id)
        .all()
    )
    paciente_map = {p.id: p for p in pacientes}
    paciente_ids = list(paciente_map.keys())

    if not paciente_ids:
        return {"psicologo_id": psicologo_id, "data_inicio": str(data_inicio),
                "data_fim": str(data_fim), "total_eventos": 0, "eventos": []}

    eventos: list[dict] = []
    tipos_ativos = set(tipos) if tipos else {"sessao", "tarefa", "checkin"}

    # ── Sessões ───────────────────────────────────────────────────────────────
    if "sessao" in tipos_ativos:
        sessoes = (
            db.query(Sessao)
            .filter(
                Sessao.paciente_id.in_(paciente_ids),
                Sessao.data_hora_inicio >= dt_inicio,
                Sessao.data_hora_inicio <= dt_fim,
            )
            .order_by(Sessao.data_hora_inicio)
            .limit(500)
            .all()
        )
        for s in sessoes:
            pac = paciente_map[s.paciente_id]
            eventos.append({
                "tipo_evento": "sessao",
                "data_hora": s.data_hora_inicio,
                "paciente": {
                    "id": pac.id,
                    "nome_completo": pac.nome_completo,
                    "foto_perfil_url": pac.foto_perfil_url,
                },
                "dados_especificos": SessaoResponse.model_validate(s).model_dump(),
            })

    # ── Tarefas ───────────────────────────────────────────────────────────────
    if "tarefa" in tipos_ativos:
        tarefas = (
            db.query(TarefaPaciente)
            .filter(
                TarefaPaciente.paciente_id.in_(paciente_ids),
                TarefaPaciente.data_vencimento.isnot(None),
                TarefaPaciente.data_vencimento >= dt_inicio,
                TarefaPaciente.data_vencimento <= dt_fim,
            )
            .order_by(TarefaPaciente.data_vencimento)
            .limit(200)
            .all()
        )
        for t in tarefas:
            pac = paciente_map[t.paciente_id]
            eventos.append({
                "tipo_evento": "tarefa",
                "data_hora": t.data_vencimento,
                "paciente": {
                    "id": pac.id,
                    "nome_completo": pac.nome_completo,
                    "foto_perfil_url": pac.foto_perfil_url,
                },
                "dados_especificos": TarefaResponse.model_validate(t).model_dump(),
            })

    # ── Check-ins ─────────────────────────────────────────────────────────────
    if "checkin" in tipos_ativos:
        checkins = (
            db.query(CheckInDiario)
            .filter(
                CheckInDiario.paciente_id.in_(paciente_ids),
                CheckInDiario.data_registro >= dt_inicio,
                CheckInDiario.data_registro <= dt_fim,
            )
            .order_by(CheckInDiario.data_registro)
            .limit(200)
            .all()
        )
        for c in checkins:
            pac = paciente_map[c.paciente_id]
            eventos.append({
                "tipo_evento": "checkin",
                "data_hora": c.data_registro,
                "paciente": {
                    "id": pac.id,
                    "nome_completo": pac.nome_completo,
                    "foto_perfil_url": pac.foto_perfil_url,
                },
                "dados_especificos": CheckInResponse.model_validate(c).model_dump(),
            })

    # Ordena tudo cronologicamente — o frontend não precisa fazer nada
    eventos.sort(key=lambda e: e["data_hora"])

    return {
        "psicologo_id": psicologo_id,
        "data_inicio": str(data_inicio),
        "data_fim": str(data_fim),
        "total_eventos": len(eventos),
        "eventos": eventos,
    }
