from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, model_validator
from backend.models.sessao import EstadoSessao


class SessaoCreateSingle(BaseModel):
    """Schema para criar uma única sessão."""
    paciente_id: int
    data_hora_inicio: datetime
    data_hora_fim: datetime
    valor_cobrado: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    # Estado inicial sempre "agendada"; apenas o endpoint /estado pode mudar
    estado: EstadoSessao = EstadoSessao.agendada

    @model_validator(mode="after")
    def validate_horario(self) -> "SessaoCreateSingle":
        if self.data_hora_fim <= self.data_hora_inicio:
            raise ValueError("data_hora_fim deve ser posterior a data_hora_inicio.")
        return self


class RecorrenciaConfig(BaseModel):
    """
    Configuração para geração de sessões recorrentes.
    intervalo_dias=7 → semanal, 14 → quinzenal, etc.
    """
    intervalo_dias: int = Field(..., ge=1, le=365)
    total_sessoes: int = Field(..., ge=2, le=52)


class SessaoCreate(BaseModel):
    """
    POST /sessoes/ — cria uma ou múltiplas sessões.
    Se recorrencia for informada, gera `recorrencia.total_sessoes` sessões
    a partir de data_hora_inicio com o intervalo definido.
    """
    paciente_id: int
    data_hora_inicio: datetime
    data_hora_fim: datetime
    valor_cobrado: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    recorrencia: Optional[RecorrenciaConfig] = None

    @model_validator(mode="after")
    def validate_horario(self) -> "SessaoCreate":
        if self.data_hora_fim <= self.data_hora_inicio:
            raise ValueError("data_hora_fim deve ser posterior a data_hora_inicio.")
        return self


class SessaoEstadoUpdate(BaseModel):
    """PATCH /sessoes/{id}/estado"""
    estado: EstadoSessao
    # Permite ajustar o valor no momento do check-in (ex: sessão de duração diferente)
    valor_cobrado: Optional[Decimal] = Field(None, ge=0, decimal_places=2)


class SessaoResponse(BaseModel):
    id: int
    paciente_id: int
    data_hora_inicio: datetime
    data_hora_fim: datetime
    estado: EstadoSessao
    valor_cobrado: Optional[Decimal]
    fatura_id: Optional[int]
    token_confirmacao: str        # UUID — usar para montar link público de confirmação
    data_criacao: datetime
    # Campo computado: indica se esta sessão está bloqueada para edição de estado
    ja_faturada: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def set_ja_faturada(self) -> "SessaoResponse":
        self.ja_faturada = self.fatura_id is not None
        return self

