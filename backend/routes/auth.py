import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import get_db
from backend.core.google_auth import GoogleAuthError, GoogleUserInfo, verificar_google_token
from backend.core.security import create_access_token, get_current_psicologo_id
from backend.models.psicologo import Psicologo
from backend.schemas.psicologo import PsicologoResponse, PsicologoMeUpdate, PsicologoOnboardingUpdate
from backend.services import psicologo_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Autenticação"])


class GoogleTokenRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    psicologo: PsicologoResponse


def _resolver_user_info(token: str) -> GoogleUserInfo:
    if settings.GOOGLE_CLIENT_ID:
        return verificar_google_token(token)
    else:
        logger.warning(
            "⚠️  GOOGLE_CLIENT_ID não configurado — usando usuário de demonstração. "
            "Configure no .env para ativar a verificação real."
        )
        return GoogleUserInfo(
            google_id="DEMO_GOOGLE_ID_109512345678901234567",
            email="psicologo@cori.demo",
            nome_exibicao="Dra. Cori Demo",
            foto_perfil_url=None,
        )


@router.post(
    "/google",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Login via Google OAuth",
)
def login_google(
    body: GoogleTokenRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    if not body.token or len(body.token.strip()) < 5:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Token Google inválido ou vazio.")
    try:
        user_info = _resolver_user_info(body.token)
    except GoogleAuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    psicologo = psicologo_service.upsert_psicologo(db, user_info=user_info)

    jwt_payload = {
        "sub": str(psicologo.id),
        "email": psicologo.email,
        "nome_exibicao": psicologo.nome_exibicao,
    }

    return TokenResponse(
        access_token=create_access_token(data=jwt_payload),
        psicologo=PsicologoResponse.model_validate(psicologo),
    )


@router.get(
    "/me",
    response_model=PsicologoResponse,
    summary="Perfil do psicólogo logado",
    description=(
        "Valida o JWT e retorna o perfil atualizado. "
        "Usar na reabertura do app para hidratar o estado global. "
        "`401` significa token expirado → redirecionar para login."
    ),
)
def get_me(
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> PsicologoResponse:
    psicologo: Psicologo | None = db.query(Psicologo).filter(Psicologo.id == psicologo_id).first()
    if not psicologo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Psicólogo não encontrado.")
    return PsicologoResponse.model_validate(psicologo)


@router.patch(
    "/me",
    response_model=PsicologoResponse,
    summary="Atualizar perfil e/ou push token",
    description=(
        "Atualiza `nome_exibicao`, `foto_perfil_url` e/ou `dispositivo_push_token`. "
        "Usar para registrar o Expo Push Token após login ou quando o SO regenera o token."
    ),
)
def update_me(
    dados: PsicologoMeUpdate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> PsicologoResponse:
    psicologo: Psicologo | None = db.query(Psicologo).filter(Psicologo.id == psicologo_id).first()
    if not psicologo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Psicólogo não encontrado.")

    update_data = dados.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(psicologo, field, value)

    db.commit()
    db.refresh(psicologo)
    return PsicologoResponse.model_validate(psicologo)


@router.patch(
    "/onboarding",
    response_model=PsicologoResponse,
    summary="Concluir onboarding do psicólogo"
)
def confirmar_onboarding(
    dados: PsicologoOnboardingUpdate,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> PsicologoResponse:
    psicologo: Psicologo | None = db.query(Psicologo).filter(Psicologo.id == psicologo_id).first()
    if not psicologo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Psicólogo não encontrado.")

    # Atualiza as configurações do onboarding
    update_data = dados.model_dump()
    for field, value in update_data.items():
        setattr(psicologo, field, value)

    # Força a flag de conclusão
    psicologo.onboarding_concluido = True

    db.commit()
    db.refresh(psicologo)
    return PsicologoResponse.model_validate(psicologo)
