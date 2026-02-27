"""
schemas/timeline.py — Schema polimórfico unificado da Super Agenda

Design:
    TimelineEvent é um envelope genérico com:
      - tipo_evento: discriminador para o frontend saber COMO renderizar o card
      - data_hora: campo de ordenação cronológica universal
      - dados_especificos: o payload real do item (Sessao, Tarefa ou CheckIn)

    O frontend itera a lista e usa `tipo_evento` como switch para escolher
    qual componente renderizar. Nenhuma lógica de ordenação ou filtragem
    acontece no cliente.

Tipos possíveis de evento:
    "sessao"    → dados_especificos = SessaoResponse
    "tarefa"    → dados_especificos = TarefaResponse
    "checkin"   → dados_especificos = CheckInResponse
"""

from datetime import datetime
from typing import Any, Literal, Union
from pydantic import BaseModel, ConfigDict

from backend.schemas.sessao import SessaoResponse
from backend.schemas.tarefa import TarefaResponse
from backend.schemas.checkin import CheckInResponse


# ─── Eventos Específicos (Discriminated Union) ────────────────────────────────

class TimelineEventSessao(BaseModel):
    tipo_evento: Literal["sessao"] = "sessao"
    data_hora: datetime
    dados_especificos: SessaoResponse

    model_config = ConfigDict(from_attributes=True)


class TimelineEventTarefa(BaseModel):
    tipo_evento: Literal["tarefa"] = "tarefa"
    data_hora: datetime
    dados_especificos: TarefaResponse

    model_config = ConfigDict(from_attributes=True)


class TimelineEventCheckin(BaseModel):
    tipo_evento: Literal["checkin"] = "checkin"
    data_hora: datetime
    dados_especificos: CheckInResponse

    model_config = ConfigDict(from_attributes=True)


# ─── Tipo Union Polimórfico ───────────────────────────────────────────────────
# Pydantic usa o campo 'tipo_evento' como discriminador para deserializar
# corretamente ao validar de um dict.
TimelineEvent = Union[TimelineEventSessao, TimelineEventTarefa, TimelineEventCheckin]


class TimelineResponse(BaseModel):
    """Resposta completa do endpoint GET /agenda/{paciente_id}/timeline"""
    paciente_id: int
    data_inicio: str   # "YYYY-MM-DD"
    data_fim: str      # "YYYY-MM-DD"
    total_eventos: int
    eventos: list[TimelineEvent]
