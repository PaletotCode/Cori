from datetime import date
from typing import Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.services.timeline_service import gerar_timeline
from backend.services.agenda_service import gerar_agenda_geral
from backend.services import notificacao_service
from backend.models.sessao import Sessao, EstadoSessao
from backend.models.paciente import Paciente

router = APIRouter(prefix="/agenda", tags=["Super Agenda / Timeline"])


# ─── Schemas de resposta ─────────────────────────────────────────────────────

class ConfirmarPublicoResponse(BaseModel):
    confirmado: bool
    paciente_nome: str
    data_hora_inicio: str
    mensagem: str


# ─── Endpoint Público (sem JWT) — Confirmação via Link ───────────────────────

@router.patch(
    "/sessoes/public/{token_confirmacao}/confirmar",
    response_model=ConfirmarPublicoResponse,
    tags=["Sessões"],
    summary="Confirmação pública de sessão pelo paciente",
    description=(
        "**Endpoint PÚBLICO — sem JWT.** "
        "Chamado quando o paciente acessa o link de confirmação enviado por WhatsApp/Email. "
        "Não requer app instalado, conta nem autenticação.\n\n"
        "1. `sessao.estado` → `'confirmada'`\n"
        "2. Cria `NotificacaoLembrete(tipo='aviso_psicologo')` com disparo imediato\n"
        "3. Worker notifica o psicólogo em até 60s"
    ),
)
def confirmar_sessao_publico(
    token_confirmacao: str,
    db: Session = Depends(get_db),
) -> ConfirmarPublicoResponse:
    sessao: Sessao | None = (
        db.query(Sessao)
        .filter(Sessao.token_confirmacao == token_confirmacao)
        .first()
    )
    if not sessao:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Link de confirmação inválido ou expirado.")

    if sessao.estado != EstadoSessao.agendada:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Esta sessão já foi processada (estado: '{sessao.estado.value}'). "
                   "Só sessões 'agendada' podem ser confirmadas.",
        )

    paciente: Paciente | None = (
        db.query(Paciente).filter(Paciente.id == sessao.paciente_id).first()
    )

    # 1. Confirma
    sessao.estado = EstadoSessao.confirmada
    db.commit()
    db.refresh(sessao)

    # 2. Aviso ao psicólogo (disparo imediato pelo worker)
    notificacao_service.agendar_aviso_psicologo(
        db, sessao=sessao, psicologo_id=paciente.psicologo_id
    )

    return ConfirmarPublicoResponse(
        confirmado=True,
        paciente_nome=paciente.nome_completo if paciente else "Paciente",
        data_hora_inicio=sessao.data_hora_inicio.isoformat(),
        mensagem="Presença confirmada! Até a sessão.",
    )


# ─── Agenda Geral do Psicólogo ───────────────────────────────────────────────

@router.get(
    "/geral",
    summary="Agenda Geral do Psicólogo",
    description=(
        "**'Bom dia, Dra. Ana.'** Visão consolidada de todos os pacientes num intervalo. "
        "Cada evento inclui `paciente` (id, nome, foto) para renderização direta. "
        "Filtrar por tipo via `tipos` (CSV): `sessao,tarefa,checkin`. Default: todos."
    ),
)
def agenda_geral(
    data_inicio: date = Query(..., description="Data de início — YYYY-MM-DD"),
    data_fim: date = Query(..., description="Data de fim — YYYY-MM-DD (inclusive)"),
    tipos: str | None = Query(None, description="CSV: 'sessao,tarefa,checkin'"),
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> Any:
    tipos_list = [t.strip() for t in tipos.split(",")] if tipos else None
    try:
        return gerar_agenda_geral(
            db,
            psicologo_id=psicologo_id,
            data_inicio=data_inicio,
            data_fim=data_fim,
            tipos=tipos_list,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


# ─── Timeline Individual do Paciente ─────────────────────────────────────────

@router.get(
    "/{paciente_id}/timeline",
    summary="Timeline Unificada do Paciente",
    description=(
        "Agrega Sessões, Tarefas e Check-ins num intervalo `data_inicio`/`data_fim`. "
        "Suporta janelas que cruzam meses (ex: 28/10 → 03/11). "
        "Lista retornada ordenada cronologicamente — **zero lógica de ordenação no cliente.**"
    ),
)
def get_timeline(
    paciente_id: int,
    data_inicio: date = Query(..., description="Data de início — YYYY-MM-DD"),
    data_fim: date = Query(..., description="Data de fim — YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> Any:
    try:
        return gerar_timeline(
            db,
            psicologo_id=psicologo_id,
            paciente_id=paciente_id,
            data_inicio=data_inicio,
            data_fim=data_fim,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
