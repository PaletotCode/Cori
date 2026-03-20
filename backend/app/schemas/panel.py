from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

BaselineItem = Literal["yesterday", "weekAgo", "monthAgo"]
PanelCardKey = Literal["sessions_today", "pending_confirmation", "weekly_revenue_forecast"]
PanelDisplayMode = Literal["dynamic", "fixed"]
PanelTrendDirection = Literal["up", "down", "flat", "unknown"]

_BASELINE_SET = {"yesterday", "weekAgo", "monthAgo"}


def _validate_baseline_order(order: list[BaselineItem]) -> None:
    if len(order) != len(_BASELINE_SET):
        raise ValueError("order deve conter exatamente os 3 itens de comparativo.")
    if len(set(order)) != len(order):
        raise ValueError("order nao pode conter itens duplicados.")
    if set(order) != _BASELINE_SET:
        raise ValueError("order deve conter apenas: yesterday, weekAgo, monthAgo.")


class PanelKpiComparisonResponse(BaseModel):
    item: BaselineItem
    baseline_value: float | None
    delta_value: float | None
    delta_percent: float | None
    trend: PanelTrendDirection
    comparable: bool
    missing_baseline: bool
    window_start_at: datetime
    window_end_at: datetime
    metadata: dict[str, object]


class PanelKpiCardResponse(BaseModel):
    key: PanelCardKey
    unit: Literal["count", "currency_cents"]
    currency: str | None = None
    current_value: float | None
    window_start_at: datetime
    window_end_at: datetime
    comparisons: list[PanelKpiComparisonResponse]
    metadata: dict[str, object]


class PanelKpisResponse(BaseModel):
    timezone: str
    generated_at: datetime
    calculation_version: Literal["panel_kpi_v1"]
    cards: list[PanelKpiCardResponse]


class PanelCardPreferencesResponse(BaseModel):
    card_key: PanelCardKey
    carousel_enabled: bool
    display_mode: PanelDisplayMode
    fixed_item: BaselineItem
    order: list[BaselineItem]


class PanelPreferencesResponse(BaseModel):
    tenant_id: str
    user_id: str
    cards: list[PanelCardPreferencesResponse]


class PanelCardPreferencesPutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    carousel_enabled: bool
    display_mode: PanelDisplayMode
    fixed_item: BaselineItem
    order: list[BaselineItem] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def validate_payload(self) -> "PanelCardPreferencesPutRequest":
        _validate_baseline_order(self.order)
        if self.display_mode == "fixed" and self.fixed_item not in self.order:
            raise ValueError("fixed_item deve existir dentro de order quando display_mode=fixed.")
        return self


class PanelCardPreferencesPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    carousel_enabled: bool | None = None
    display_mode: PanelDisplayMode | None = None
    fixed_item: BaselineItem | None = None
    order: list[BaselineItem] | None = Field(default=None, min_length=3, max_length=3)

    @model_validator(mode="after")
    def validate_payload(self) -> "PanelCardPreferencesPatchRequest":
        if (
            self.carousel_enabled is None
            and self.display_mode is None
            and self.fixed_item is None
            and self.order is None
        ):
            raise ValueError("Informe ao menos um campo para atualizar.")
        if self.order is not None:
            _validate_baseline_order(self.order)
        return self
