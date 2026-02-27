from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field
from backend.models.fatura import EstadoFatura


class GerarFaturaRequest(BaseModel):
    """
    POST /faturas/gerar/{paciente_id}
    Define o mês/ano que será varrido para compor a fatura.
    """
    mes_referencia: int = Field(..., ge=1, le=12)
    ano_referencia: int = Field(..., ge=2020, le=2100)
    data_vencimento: date


class FaturaPagarRequest(BaseModel):
    """PATCH /faturas/{id}/pagar"""
    data_pagamento: date = Field(default_factory=date.today)


class FaturaResponse(BaseModel):
    id: int
    paciente_id: int
    mes_referencia: int
    ano_referencia: int
    valor_total: Decimal
    estado: EstadoFatura
    data_vencimento: date
    data_pagamento: Optional[date]
    data_criacao: datetime
    # Campo computado: quantidade de sessões incluídas nesta fatura
    total_sessoes: int = 0

    model_config = {"from_attributes": True}
