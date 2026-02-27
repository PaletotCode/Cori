"""
routes/triagem.py — Self-Onboarding público + aprovação protegida

POST /triagem/{slug}  → PÚBLICO, sem JWT
    Qualquer pessoa com o link pode submeter dados.
    O status "pendente_aprovacao" é forçado pelo service.

PATCH /pacientes/{id}/aprovar → PROTEGIDO (JWT)
    Apenas o psicólogo dono pode aprovar.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.schemas.paciente import PacienteCreate, PacienteResponse
from backend.services.triagem_service import (
    AprovarPacienteRequest,
    criar_via_triagem,
    aprovar_paciente,
)

router = APIRouter(tags=["Triagem / Self-Onboarding"])


@router.post(
    "/triagem/{slug}",
    response_model=PacienteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Formulário público de triagem",
    description=(
        "**Endpoint PÚBLICO** — não requer autenticação. "
        "O paciente preenche via link `https://cori.app/triagem/{slug}`. "
        "O `status` é forçado para `pendente_aprovacao` independente do payload. "
        "O campo `psicologo_id` é resolvido pelo slug, nunca aceito do cliente."
    ),
)
def triagem_publica(
    slug: str,
    dados: PacienteCreate,
    db: Session = Depends(get_db),
) -> PacienteResponse:
    try:
        paciente = criar_via_triagem(db, slug=slug, dados=dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return PacienteResponse.model_validate(paciente)


@router.patch(
    "/pacientes/{paciente_id}/aprovar",
    response_model=PacienteResponse,
    summary="Aprovar paciente da triagem",
    description=(
        "**Protegido por JWT.** Muda status de `pendente_aprovacao` → `ativo`. "
        "Permite definir `valor_sessao`, `horario` e `dia_vencimento` acordados. "
        "Retorna `422` se o paciente não estiver em `pendente_aprovacao`."
    ),
)
def aprovar(
    paciente_id: int,
    dados: AprovarPacienteRequest,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> PacienteResponse:
    try:
        paciente = aprovar_paciente(
            db, psicologo_id=psicologo_id, paciente_id=paciente_id, dados=dados
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return PacienteResponse.model_validate(paciente)
