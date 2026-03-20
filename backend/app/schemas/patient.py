from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PatientContactChannel = Literal["whatsapp", "email", "phone"]
PatientProfileSource = Literal["manual", "intake"]
PatientSortBy = Literal["full_name", "created_at", "updated_at"]
SortOrder = Literal["asc", "desc"]
PatientChangeType = Literal["created", "updated", "overwritten", "archived"]
PatientOverviewBaselineItem = Literal["yesterday", "weekAgo", "monthAgo"]
PatientOverviewKpiCardKey = Literal[
    "completed_sessions",
    "upcoming_sessions",
    "assigned_activities",
    "patient_journey_days",
]
PatientOverviewTrendDirection = Literal["up", "down", "flat", "unknown"]


class PatientCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=3, max_length=180)
    preferred_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    birth_date: date | None = None
    pronouns: str | None = Field(default=None, max_length=60)
    emergency_contact_name: str | None = Field(default=None, max_length=180)
    emergency_contact_phone: str | None = Field(default=None, max_length=40)
    preferred_contact_channel: PatientContactChannel = "whatsapp"
    communication_notes: str | None = Field(default=None, max_length=500)


class PatientUpdateRequest(PatientCreateRequest):
    overwrite_initial_registration: bool = False
    overwrite_reason: str | None = Field(default=None, max_length=500)


class PatientListItemResponse(BaseModel):
    id: str
    full_name: str
    preferred_name: str | None
    email: str | None
    phone: str | None
    preferred_contact_channel: PatientContactChannel
    profile_source: PatientProfileSource
    whatsapp_number_valid: bool
    updated_at: datetime


class PatientDetailResponse(BaseModel):
    id: str
    tenant_id: str
    full_name: str
    preferred_name: str | None
    email: str | None
    phone: str | None
    birth_date: date | None
    pronouns: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    preferred_contact_channel: PatientContactChannel
    communication_notes: str | None
    profile_source: PatientProfileSource
    whatsapp_number_valid: bool
    created_at: datetime
    updated_at: datetime


class PatientChangeResponse(BaseModel):
    id: str
    change_type: PatientChangeType
    changed_fields: list[str]
    previous_data: dict[str, object] | None
    new_data: dict[str, object] | None
    changed_by_user_id: str | None
    reason: str | None
    natural_summary: str
    created_at: datetime


class PatientTimelineEventResponse(BaseModel):
    id: str
    event_type: str
    category_label: str
    actor_type: str
    actor_label: str
    actor_id: str | None
    payload: dict[str, object]
    natural_title: str
    natural_event_label: str
    natural_detail: str
    created_at: datetime


class PatientDeleteResponse(BaseModel):
    patient_id: str
    archived_at: datetime


class PatientOverviewKpiComparisonResponse(BaseModel):
    item: PatientOverviewBaselineItem
    baseline_value: float | None
    delta_value: float | None
    delta_percent: float | None
    trend: PatientOverviewTrendDirection
    comparable: bool
    missing_baseline: bool
    window_start_at: datetime
    window_end_at: datetime
    metadata: dict[str, object]


class PatientOverviewKpiCardResponse(BaseModel):
    key: PatientOverviewKpiCardKey
    unit: Literal["count"]
    current_value: float | None
    window_start_at: datetime
    window_end_at: datetime
    comparisons: list[PatientOverviewKpiComparisonResponse]
    metadata: dict[str, object]


class PatientOverviewKpisResponse(BaseModel):
    timezone: str
    generated_at: datetime
    calculation_version: Literal["patient_overview_kpi_v1"]
    cards: list[PatientOverviewKpiCardResponse]
