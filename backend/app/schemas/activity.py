from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ActivityType = Literal["simple_task", "guided_meditation", "habit", "document_reading"]
ActivityStatus = Literal[
    "scheduled",
    "assigned",
    "opened",
    "in_progress",
    "paused",
    "completed",
    "canceled",
    "overdue",
]
ActivityRecurrenceRule = Literal["none", "daily", "weekly"]
PsychologistActivityAction = Literal["resend", "cancel", "reopen"]
PatientActivityAction = Literal["open", "start", "pause", "complete"]


class ActivityCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str = Field(min_length=32, max_length=36)
    activity_type: ActivityType
    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str | None = Field(default=None, max_length=2000)
    document_url: str | None = Field(default=None, max_length=500)
    configuration: dict[str, object] | None = None
    due_at: datetime
    recurrence_rule: ActivityRecurrenceRule = "none"
    recurrence_interval: int = Field(default=1, ge=1, le=30)
    recurrence_end_at: datetime | None = None


class ActivityUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity_type: ActivityType | None = None
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str | None = Field(default=None, max_length=2000)
    document_url: str | None = Field(default=None, max_length=500)
    configuration: dict[str, object] | None = None
    due_at: datetime | None = None
    recurrence_rule: ActivityRecurrenceRule | None = None
    recurrence_interval: int | None = Field(default=None, ge=1, le=30)
    recurrence_end_at: datetime | None = None


class ActivityPsychologistActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: PsychologistActivityAction
    reason: str | None = Field(default=None, max_length=500)


class ActivityPatientActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: PatientActivityAction
    feedback_note: str | None = Field(default=None, max_length=1000)


class ActivityListItemResponse(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    psychologist_id: str
    source_template_id: str | None
    activity_type: ActivityType
    status: ActivityStatus
    title: str
    due_at: datetime
    scheduled_send_at: datetime | None
    assigned_at: datetime
    overdue_at: datetime | None
    recurrence_rule: ActivityRecurrenceRule
    recurrence_interval: int
    recurrence_end_at: datetime | None
    execution_elapsed_seconds: int


class ActivityDetailResponse(ActivityListItemResponse):
    tenant_id: str
    description: str | None
    instructions: str | None
    document_url: str | None
    configuration: dict[str, object]
    opened_at: datetime | None
    started_at: datetime | None
    paused_at: datetime | None
    completed_at: datetime | None
    canceled_at: datetime | None
    feedback_note: str | None
    created_at: datetime
    updated_at: datetime


class ActivityCreateResponse(ActivityDetailResponse):
    patient_access_token: str
    patient_access_link: str


class ActivityPublicListResponse(BaseModel):
    patient_id: str
    patient_name: str
    activities: list[ActivityListItemResponse]


class ActivityPublicActionResponse(BaseModel):
    activity: ActivityDetailResponse


class ActivityTimelineEventResponse(BaseModel):
    id: str
    activity_id: str | None
    patient_id: str | None
    event_type: str
    actor_type: str
    actor_id: str | None
    payload: dict[str, object]
    created_at: datetime


class ActivityOverdueRunResponse(BaseModel):
    processed: int
    marked_overdue: int


class ActivityDispatchRunResponse(BaseModel):
    processed: int
    dispatched: int
