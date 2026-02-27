from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class PsicologoBase(BaseModel):
    email: EmailStr
    nome_exibicao: Optional[str] = None
    foto_perfil_url: Optional[str] = None


class PsicologoCreate(PsicologoBase):
    google_id: str


class PsicologoResponse(PsicologoBase):
    id: int
    slug_link_publico: Optional[str] = None
    dispositivo_push_token: Optional[str] = None
    data_criacao: datetime

    model_config = {"from_attributes": True}


class PsicologoMeUpdate(BaseModel):
    """PATCH /auth/me — todos os campos opcionais."""
    nome_exibicao: Optional[str] = None
    foto_perfil_url: Optional[str] = None
    # Registrar/atualizar token Expo Push após login ou regeneração do SO
    dispositivo_push_token: Optional[str] = None
