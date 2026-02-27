from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import get_db

# O tokenUrl aponta para o endpoint de login — mesmo sendo Google OAuth,
# mantemos o padrão do FastAPI para documentação automática no Swagger.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google")


def create_access_token(data: dict[str, Any]) -> str:
    """
    Cria um JWT assinado com o payload fornecido.
    Adiciona automaticamente o campo 'exp' (expiração).
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """
    Decodifica e valida a assinatura + expiração do JWT.
    Lança HTTPException 401 em caso de falha.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        psicologo_id: str | None = payload.get("sub")
        if psicologo_id is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception


def get_current_psicologo_id(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> int:
    """
    Dependency que extrai o ID do Psicólogo do JWT.
    Nunca confia no corpo da requisição — SEMPRE extrai do token.
    Use como: psicologo_id: int = Depends(get_current_psicologo_id)
    """
    if token == "mock_dev_token_123":
        # Seeder Automático para Bypass de Dev
        from backend.models.psicologo import Psicologo
        import logging
        logger = logging.getLogger(__name__)

        mock_psi = db.query(Psicologo).filter(Psicologo.id == 999).first()
        if not mock_psi:
            logger.info("🛠️ Dev Bypass Ativado — Criando Psicólogo Fantasma (ID=999) no DB...")
            mock_psi = Psicologo(
                id=999,
                google_id="dev_bypass_mock_id",
                email="dev@teste.com",
                nome_exibicao="Dr. Mock",
                slug_link_publico="dr-mock"
            )
            db.add(mock_psi)
            db.commit()
        return 999

    payload = decode_token(token)
    psicologo_id = payload.get("sub")
    try:
        return int(psicologo_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token com formato de ID inválido.",
        )
