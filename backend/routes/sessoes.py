from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.schemas.sessao import SessaoCreate, SessaoEstadoUpdate, SessaoResponse
from backend.services import sessao_service
from backend.services import notificacao_service
from backend.models.sessao import EstadoSessao
from backend.models.paciente import Paciente

router = APIRouter(prefix="/sessoes", tags=["Sessões"])


@router.post(
    "/",
    response_model=list[SessaoResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Criar sessão(ões)",
    description=(
        "Cria uma ou múltiplas sessões recorrentes. "
        "Se `recorrencia` for informada, gera `total_sessoes` a partir de `data_hora_inicio`. "
        "O `valor_cobrado` herda de `paciente.valor_sessao` se omitido. "
        "**Gatilho automático:** agenda lembrete push 24h antes de cada sessão criada."
    ),
)
def criar_sessoes(
    dados: SessaoCreate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[SessaoResponse]:
    try:
        sessoes = sessao_service.criar_sessoes(db, psicologo_id=psicologo_id, dados=dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return [SessaoResponse.model_validate(s) for s in sessoes]


@router.get(
    "/paciente/{paciente_id}",
    response_model=list[SessaoResponse],
    summary="Listar sessões de um paciente",
)
def listar_sessoes(
    paciente_id: int,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[SessaoResponse]:
    sessoes = sessao_service.listar_sessoes_paciente(
        db, psicologo_id=psicologo_id, paciente_id=paciente_id, skip=skip, limit=limit
    )
    return [SessaoResponse.model_validate(s) for s in sessoes]


@router.patch(
    "/{sessao_id}/estado",
    response_model=SessaoResponse,
    summary="Check-in / Atualizar estado da sessão",
    description=(
        "**Endpoint de Check-in.** Transiciona o estado da sessão e aplica a lógica financeira:\n\n"
        "- `realizada` ou `falta_cobrada`: recalcula `valor_total` da fatura se já vinculada.\n"
        "- `cancelada_paciente` ou `remarcada`: desvincula da fatura não-paga e recalcula total."
    ),
)
def atualizar_estado(
    sessao_id: int,
    dados: SessaoEstadoUpdate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> SessaoResponse:
    sessao = sessao_service.buscar_sessao(db, psicologo_id=psicologo_id, sessao_id=sessao_id)
    if not sessao:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada.")

    try:
        sessao, _ = sessao_service.atualizar_estado(db, sessao=sessao, dados=dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    return SessaoResponse.model_validate(sessao)


@router.patch(
    "/public/confirmar/{token_confirmacao}",
    response_model=SessaoResponse,
    summary="[PÚBLICO] Paciente confirma presença na sessão",
    description=(
        "**Endpoint PÚBLICO** — não requer autenticação. "
        "Acessado via Deep Link ou web link externo utilizando o UUID único da sessão. "
        "Se o link for válido e a sessão ainda for 'agendada', altera para 'confirmada'."
    ),
)
def confirmar_sessao_publica_endpoint(
    token_confirmacao: str,
    db: Session = Depends(get_db),
) -> SessaoResponse:
    try:
        sessao = sessao_service.confirmar_sessao_publica(db, token_confirmacao=token_confirmacao)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    
    return SessaoResponse.model_validate(sessao)


@router.patch(
    "/{sessao_id}/confirmar_pelo_paciente",
    response_model=SessaoResponse,
    summary="Paciente confirma presença na sessão",
    description=(
        "**Endpoint de Ação Interativa** — chamado quando o paciente toca em "
        "'Confirmar' na push notification.\n\n"
        "1. Muda estado da sessão para `confirmada`.\n"
        "2. Cria imediatamente uma `NotificacaoLembrete` do tipo `aviso_psicologo` "
        "para que o worker notifique o psicólogo no próximo tick (≤ 60s).\n\n"
        "> **Segurança:** Em produção substituir JWT por token assinado de uso único "
        "embutido no payload da push notification."
    ),
)
def confirmar_pelo_paciente(
    sessao_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> SessaoResponse:
    sessao = sessao_service.buscar_sessao(db, psicologo_id=psicologo_id, sessao_id=sessao_id)
    if not sessao:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada.")

    if sessao.estado != EstadoSessao.agendada:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Não é possível confirmar sessão com estado '{sessao.estado.value}'. "
                "Apenas sessões 'agendada' podem ser confirmadas."
            ),
        )

    # Busca psicologo_id para o aviso via ownership chain
    paciente = db.query(Paciente).filter(Paciente.id == sessao.paciente_id).first()

    # 1. Muda estado para confirmada
    sessao.estado = EstadoSessao.confirmada
    db.commit()
    db.refresh(sessao)

    # 2. Agenda aviso imediato ao psicólogo (disparo no próximo tick do worker)
    notificacao_service.agendar_aviso_psicologo(
        db,
        sessao=sessao,
        psicologo_id=paciente.psicologo_id,
    )

    return SessaoResponse.model_validate(sessao)
