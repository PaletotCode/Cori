from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.activity import (
    ActivityDetailResponse,
    ActivityRecurrenceRule,
    ActivityType,
)
from app.schemas.form import (
    ClinicalFormDetailResponse,
    FormSectionRequest,
    FormSectionResponse,
)

TemplateSendMode = Literal["immediate", "scheduled"]


class ActivityTemplateCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str | None = Field(default=None, max_length=2000)
    document_url: str | None = Field(default=None, max_length=500)
    configuration: dict[str, object] | None = None
    activity_type: ActivityType


class ActivityTemplateUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str | None = Field(default=None, max_length=2000)
    document_url: str | None = Field(default=None, max_length=500)
    configuration: dict[str, object] | None = None
    activity_type: ActivityType | None = None


class ActivityTemplateResponse(BaseModel):
    id: str
    tenant_id: str
    psychologist_id: str
    title: str
    description: str | None
    instructions: str | None
    document_url: str | None
    configuration: dict[str, object]
    activity_type: ActivityType
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ActivityTemplateAssignOverridesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str | None = Field(default=None, max_length=2000)
    document_url: str | None = Field(default=None, max_length=500)
    configuration: dict[str, object] | None = None
    activity_type: ActivityType | None = None
    recurrence_rule: ActivityRecurrenceRule | None = None
    recurrence_interval: int | None = Field(default=None, ge=1, le=30)
    recurrence_end_at: datetime | None = None


class ActivityTemplateAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str = Field(min_length=32, max_length=36)
    send_mode: TemplateSendMode
    scheduled_send_at: datetime | None = None
    due_at: datetime
    overrides: ActivityTemplateAssignOverridesRequest | None = None


class ActivityTemplateAssignResponse(BaseModel):
    idempotency_replayed: bool
    activity: ActivityDetailResponse


class FormTemplateCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=180)
    subtitle: str | None = Field(default=None, max_length=300)
    header: str | None = Field(default=None, max_length=1500)
    sections: list[FormSectionRequest] = Field(min_length=1, max_length=20)


class FormTemplateUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=180)
    subtitle: str | None = Field(default=None, max_length=300)
    header: str | None = Field(default=None, max_length=1500)
    sections: list[FormSectionRequest] | None = Field(default=None, min_length=1, max_length=20)


class FormTemplateResponse(BaseModel):
    id: str
    tenant_id: str
    psychologist_id: str
    title: str
    subtitle: str | None
    header: str | None
    sections: list[FormSectionResponse]
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class FormTemplateAssignOverridesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=180)
    subtitle: str | None = Field(default=None, max_length=300)
    header: str | None = Field(default=None, max_length=1500)
    sections: list[FormSectionRequest] | None = Field(default=None, min_length=1, max_length=20)


class FormTemplateAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str = Field(min_length=32, max_length=36)
    send_mode: TemplateSendMode
    scheduled_send_at: datetime | None = None
    overrides: FormTemplateAssignOverridesRequest | None = None


class FormTemplateAssignResponse(BaseModel):
    idempotency_replayed: bool
    form: ClinicalFormDetailResponse
