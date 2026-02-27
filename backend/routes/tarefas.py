from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.schemas.tarefa import TarefaCreate, TarefaStatusUpdate, TarefaResponse
from backend.services import tarefa_service

router = APIRouter(prefix="/tarefas", tags=["Tarefas (Para Casa)"])


@router.post("/", response_model=TarefaResponse, status_code=status.HTTP_201_CREATED,
             summary="Atribuir tarefa ao paciente")
def criar_tarefa(
    dados: TarefaCreate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> TarefaResponse:
    try:
        tarefa = tarefa_service.criar_tarefa(db, psicologo_id=psicologo_id, dados=dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return TarefaResponse.model_validate(tarefa)


@router.get("/paciente/{paciente_id}", response_model=list[TarefaResponse],
            summary="Listar tarefas de um paciente")
def listar_tarefas(
    paciente_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[TarefaResponse]:
    tarefas = tarefa_service.listar_tarefas(db, psicologo_id=psicologo_id, paciente_id=paciente_id)
    return [TarefaResponse.model_validate(t) for t in tarefas]


@router.patch("/{tarefa_id}/status", response_model=TarefaResponse,
              summary="Atualizar status da tarefa")
def atualizar_status(
    tarefa_id: int,
    dados: TarefaStatusUpdate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> TarefaResponse:
    try:
        tarefa = tarefa_service.atualizar_status_tarefa(
            db, psicologo_id=psicologo_id, tarefa_id=tarefa_id, dados=dados
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return TarefaResponse.model_validate(tarefa)
