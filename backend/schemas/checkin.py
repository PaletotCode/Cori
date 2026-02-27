from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CheckInCreate(BaseModel):
    paciente_id: int
    nivel_humor: int = Field(..., ge=1, le=5, description="1=muito ruim, 5=excelente")
    nivel_ansiedade: int = Field(..., ge=1, le=10, description="1=nenhuma, 10=extrema")
    anotacao_paciente: Optional[str] = None


class CheckInResponse(BaseModel):
    id: int
    paciente_id: int
    data_registro: datetime
    nivel_humor: int
    nivel_ansiedade: int
    anotacao_paciente: Optional[str]

    model_config = {"from_attributes": True}
