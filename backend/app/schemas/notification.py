from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

NotificationCategory = Literal[
    "sessions",
    "activities",
    "forms",
    "documents",
    "notifications",
    "app_usage",
]
NotificationRuleCategory = Literal[
    "all",
    "sessions",
    "activities",
    "forms",
    "documents",
    "notifications",
    "app_usage",
]
NotificationDeliveryStatus = Literal[
    "queued",
    "sent",
    "delivered",
    "opened",
    "action_taken",
    "failed",
]
NotificationInboxAction = Literal["open", "action_taken"]
PsychologistDocumentAction = Literal["shared"]
PatientDocumentAction = Literal["opened", "acknowledged"]


class NotificationRuleUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    inbox_enabled: bool = True
    push_enabled: bool = True
    realtime_enabled: bool = True
    quiet_hours_start: int | None = Field(default=None, ge=0, le=23)
    quiet_hours_end: int | None = Field(default=None, ge=0, le=23)
    max_notifications_per_hour: int = Field(default=20, ge=1, le=120)
    event_category: NotificationRuleCategory = "all"


class NotificationRuleResponse(BaseModel):
    id: str | None
    tenant_id: str
    patient_id: str | None
    event_category: NotificationRuleCategory
    enabled: bool
    inbox_enabled: bool
    push_enabled: bool
    realtime_enabled: bool
    quiet_hours_start: int | None
    quiet_hours_end: int | None
    max_notifications_per_hour: int
    source: Literal["explicit", "practice_profile_default", "system_default"]
    updated_at: datetime | None


class NotificationDeliveryResponse(BaseModel):
    id: str
    tenant_id: str
    patient_id: str
    event_type: str
    category: NotificationCategory
    title: str
    body: str
    status: NotificationDeliveryStatus
    status_reason: str | None
    channel_inbox: bool
    channel_push: bool
    channel_realtime: bool
    metadata: dict[str, object]
    queued_at: datetime
    sent_at: datetime | None
    delivered_at: datetime | None
    opened_at: datetime | None
    action_taken_at: datetime | None
    failed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PatientInboxResponse(BaseModel):
    patient_id: str
    patient_name: str
    notifications: list[NotificationDeliveryResponse]


class NotificationInboxActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: NotificationInboxAction


class UnifiedTimelineEventResponse(BaseModel):
    id: str
    category: NotificationCategory
    event_type: str
    actor_type: str
    actor_id: str | None
    session_id: str | None
    activity_id: str | None
    form_id: str | None
    notification_delivery_id: str | None
    payload: dict[str, object]
    created_at: datetime


class PsychologistDocumentEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: PsychologistDocumentAction
    document_title: str = Field(min_length=2, max_length=200)
    note: str | None = Field(default=None, max_length=500)


class PatientDocumentEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: PatientDocumentAction
    note: str | None = Field(default=None, max_length=500)

