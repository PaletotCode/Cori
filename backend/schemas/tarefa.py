from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from backend.models.tarefa_paciente import StatusTarefa


class TarefaCreate(BaseModel):
    paciente_id: int
    titulo: str = Field(..., min_length=1, max_length=255)
    descricao: Optional[str] = None
    data_vencimento: Optional[datetime] = None


class TarefaStatusUpdate(BaseModel):
    status: StatusTarefa


class TarefaResponse(BaseModel):
    id: int
    paciente_id: int
    titulo: str
    descricao: Optional[str]
    data_vencimento: Optional[datetime]
    status: StatusTarefa
    data_criacao: datetime

    model_config = {"from_attributes": True}
