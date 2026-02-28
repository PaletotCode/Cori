from datetime import datetime
from typing import Optional, List
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
    
    # Configurações do Onboarding
    onboarding_concluido: bool
    crp: Optional[str] = None
    duracao_sessao_padrao_minutos: int
    intervalo_sessao_padrao_minutos: int
    dias_atendimento: Optional[List[str]] = None
    modelo_cobranca_padrao: str
    valor_sessao_padrao: Optional[float] = None
    chave_pix: Optional[str] = None
    cobrar_faltas_nao_avisadas: bool

    data_criacao: datetime

    model_config = {"from_attributes": True}


class PsicologoOnboardingUpdate(BaseModel):
    """Payload para o PATCH /auth/onboarding."""
    nome_exibicao: str
    crp: Optional[str] = None
    foto_perfil_url: Optional[str] = None
    duracao_sessao_padrao_minutos: int
    intervalo_sessao_padrao_minutos: int
    dias_atendimento: List[str]
    modelo_cobranca_padrao: str
    valor_sessao_padrao: Optional[float] = None
    chave_pix: Optional[str] = None
    cobrar_faltas_nao_avisadas: bool


class PsicologoMeUpdate(BaseModel):
    """PATCH /auth/me — todos os campos opcionais."""
    nome_exibicao: Optional[str] = None
    foto_perfil_url: Optional[str] = None
    # Registrar/atualizar token Expo Push após login ou regeneração do SO
    dispositivo_push_token: Optional[str] = None
