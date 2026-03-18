from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SessionStatus = Literal["scheduled", "confirmed", "rescheduled", "canceled", "completed"]
SessionLocationMode = Literal["online", "presential", "hybrid"]
AgendaView = Literal["day", "week", "month"]
SessionAction = Literal["confirm", "reschedule", "cancel", "complete"]


class SessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str = Field(min_length=32, max_length=36)
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    location_mode: SessionLocationMode = "online"
    meeting_link: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)


class SessionActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: SessionAction
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=500)


class SessionAgendaItemResponse(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    psychologist_id: str
    status: SessionStatus
    location_mode: SessionLocationMode
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    confirmation_token_expires_at: datetime


class SessionDetailResponse(BaseModel):
    id: str
    tenant_id: str
    patient_id: str
    patient_name: str
    psychologist_id: str
    status: SessionStatus
    location_mode: SessionLocationMode
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    meeting_link: str | None
    notes: str | None
    cancellation_reason: str | None
    canceled_at: datetime | None
    confirmed_at: datetime | None
    confirmed_by: str | None
    rescheduled_at: datetime | None
    confirmation_token_expires_at: datetime
    created_at: datetime
    updated_at: datetime


class SessionCreateResponse(SessionDetailResponse):
    confirmation_token: str
    confirmation_link: str


class SessionPublicListResponse(BaseModel):
    patient_id: str
    patient_name: str
    sessions: list[SessionAgendaItemResponse]


class SessionPublicConfirmResponse(BaseModel):
    session_id: str
    status: SessionStatus
    confirmed_at: datetime | None


class SessionReminderRunResponse(BaseModel):
    processed: int
    sent: int
    failed: int
