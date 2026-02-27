from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.schemas.checkin import CheckInCreate, CheckInResponse
from backend.services import checkin_service

router = APIRouter(prefix="/checkins", tags=["Check-ins de Humor"])


@router.post("/", response_model=CheckInResponse, status_code=status.HTTP_201_CREATED,
             summary="Registrar check-in diário")
def criar_checkin(
    dados: CheckInCreate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> CheckInResponse:
    try:
        checkin = checkin_service.criar_checkin(db, psicologo_id=psicologo_id, dados=dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return CheckInResponse.model_validate(checkin)


@router.get(
    "/paciente/{paciente_id}",
    response_model=list[CheckInResponse],
    summary="Listar check-ins de um paciente",
)
def listar_checkins(
    paciente_id: int,
    mes: int | None = Query(None, ge=1, le=12),
    ano: int | None = Query(None, ge=2020),
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[CheckInResponse]:
    checkins = checkin_service.listar_checkins(
        db, psicologo_id=psicologo_id, paciente_id=paciente_id, mes=mes, ano=ano
    )
    return [CheckInResponse.model_validate(c) for c in checkins]
