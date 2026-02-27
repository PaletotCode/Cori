from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.schemas.paciente import PacienteCreate, PacienteResponse, PacienteUpdate
from backend.services import paciente_service

router = APIRouter(prefix="/pacientes", tags=["Pacientes"])


@router.post(
    "/",
    response_model=PacienteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar novo Paciente",
    description=(
        "Cria um paciente vinculado ao psicólogo autenticado. "
        "`psicologo_id` é extraído exclusivamente do JWT — nunca do corpo da requisição."
    ),
)
def criar_paciente(
    dados: PacienteCreate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> PacienteResponse:
    paciente = paciente_service.criar_paciente(db, psicologo_id=psicologo_id, dados=dados)
    return PacienteResponse.model_validate(paciente)


@router.get(
    "/",
    response_model=list[PacienteResponse],
    summary="Listar Pacientes",
    description="Retorna todos os pacientes do psicólogo autenticado, com paginação opcional.",
)
def listar_pacientes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[PacienteResponse]:
    pacientes = paciente_service.listar_pacientes(db, psicologo_id=psicologo_id, skip=skip, limit=limit)
    return [PacienteResponse.model_validate(p) for p in pacientes]


@router.get(
    "/{paciente_id}",
    response_model=PacienteResponse,
    summary="Detalhes do Paciente",
)
def detalhar_paciente(
    paciente_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> PacienteResponse:
    paciente = paciente_service.buscar_paciente(db, psicologo_id=psicologo_id, paciente_id=paciente_id)
    if not paciente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente não encontrado.")
    return PacienteResponse.model_validate(paciente)


@router.patch(
    "/{paciente_id}",
    response_model=PacienteResponse,
    summary="Atualizar Paciente (parcial)",
    description="Atualiza apenas os campos enviados. Campos omitidos são mantidos.",
)
def atualizar_paciente(
    paciente_id: int,
    dados: PacienteUpdate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> PacienteResponse:
    paciente = paciente_service.buscar_paciente(db, psicologo_id=psicologo_id, paciente_id=paciente_id)
    if not paciente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente não encontrado.")
    paciente = paciente_service.atualizar_paciente(db, paciente=paciente, dados=dados)
    return PacienteResponse.model_validate(paciente)


@router.delete(
    "/{paciente_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover Paciente",
)
def deletar_paciente(
    paciente_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> None:
    paciente = paciente_service.buscar_paciente(db, psicologo_id=psicologo_id, paciente_id=paciente_id)
    if not paciente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente não encontrado.")
    paciente_service.deletar_paciente(db, paciente=paciente)
