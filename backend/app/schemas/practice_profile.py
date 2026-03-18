from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ServiceModality = Literal["online", "presential", "hybrid"]
TriageMode = Literal["standard", "custom"]


class PracticeProfileUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    practice_name: str = Field(min_length=3, max_length=180)
    clinical_approach: str = Field(min_length=2, max_length=120)
    service_modality: ServiceModality
    in_person_address: str | None = Field(default=None, max_length=255)
    session_price_cents: int = Field(ge=0, le=1_000_000)
    currency: Literal["BRL"] = "BRL"
    late_cancellation_window_hours: int = Field(ge=1, le=168)
    late_cancellation_fee_percent: int = Field(ge=0, le=100)
    no_show_fee_percent: int = Field(ge=0, le=100)
    notification_email_enabled: bool
    notification_whatsapp_enabled: bool
    notification_push_enabled: bool
    session_reminder_hours_before: list[int] = Field(min_length=1, max_length=6)
    default_triage_mode: TriageMode
    default_triage_message: str | None = Field(default=None, max_length=500)


class PracticeProfileResponse(BaseModel):
    id: str
    tenant_id: str
    practice_name: str
    clinical_approach: str
    service_modality: ServiceModality
    in_person_address: str | None
    session_price_cents: int
    currency: str
    late_cancellation_window_hours: int
    late_cancellation_fee_percent: int
    no_show_fee_percent: int
    notification_email_enabled: bool
    notification_whatsapp_enabled: bool
    notification_push_enabled: bool
    session_reminder_hours_before: list[int]
    default_triage_mode: TriageMode
    default_triage_message: str | None
    onboarding_completed: bool
    created_at: datetime
    updated_at: datetime
