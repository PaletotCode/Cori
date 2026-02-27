from datetime import datetime
from pydantic import BaseModel, Field
from backend.models.anotacao_clinica import TipoAnotacao


class AnotacaoCreate(BaseModel):
    """
    POST /anotacoes/
    sessao_id deve pertencer a uma sessão "realizada" do paciente do psicólogo logado.
    """
    sessao_id: int
    conteudo: str = Field(..., min_length=1)
    tipo: TipoAnotacao = TipoAnotacao.evolucao_oficial


class AnotacaoResponse(BaseModel):
    id: int
    paciente_id: int
    sessao_id: int
    conteudo: str
    tipo: TipoAnotacao
    data_registo: datetime

    model_config = {"from_attributes": True}
