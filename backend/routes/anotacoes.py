from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.schemas.anotacao_clinica import AnotacaoCreate, AnotacaoResponse
from backend.services import anotacao_service

router = APIRouter(prefix="/anotacoes", tags=["Prontuário Clínico"])


@router.post(
    "/",
    response_model=AnotacaoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar anotação clínica",
    description=(
        "Cria um registro clínico associado a uma sessão **realizada**. "
        "Valida em cadeia: sessão existe → pertence ao psicólogo → está 'realizada' → "
        "ainda não possui anotação (One-to-One). "
        "Retorna `422` em qualquer violação de negócio."
    ),
)
def criar_anotacao(
    dados: AnotacaoCreate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> AnotacaoResponse:
    try:
        anotacao = anotacao_service.criar_anotacao(db, psicologo_id=psicologo_id, dados=dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return AnotacaoResponse.model_validate(anotacao)


@router.get(
    "/paciente/{paciente_id}",
    response_model=list[AnotacaoResponse],
    summary="Listar anotações de um paciente",
    description="Retorna todas as anotações do paciente, ordenadas da mais recente para a mais antiga.",
)
def listar_anotacoes_paciente(
    paciente_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[AnotacaoResponse]:
    anotacoes = anotacao_service.listar_anotacoes_paciente(
        db, psicologo_id=psicologo_id, paciente_id=paciente_id
    )
    return [AnotacaoResponse.model_validate(a) for a in anotacoes]


@router.get(
    "/sessao/{sessao_id}",
    response_model=AnotacaoResponse,
    summary="Buscar anotação de uma sessão específica",
)
def buscar_por_sessao(
    sessao_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> AnotacaoResponse:
    anotacao = anotacao_service.buscar_anotacao_por_sessao(
        db, psicologo_id=psicologo_id, sessao_id=sessao_id
    )
    if not anotacao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhuma anotação clínica encontrada para esta sessão.",
        )
    return AnotacaoResponse.model_validate(anotacao)
