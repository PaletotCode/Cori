from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

FormStatus = Literal[
    "draft",
    "published",
    "scheduled",
    "assigned",
    "opened",
    "partial_saved",
    "submitted",
    "reviewed",
]
FormFieldType = Literal[
    "short_text",
    "long_text",
    "multiple_choice",
    "checkbox",
    "scale",
    "date_time",
]
PsychologistFormAction = Literal["publish", "send", "schedule", "review"]
PatientFormAction = Literal["open", "partial_save", "submit"]


class FormQuestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str | None = Field(default=None, max_length=60)
    label: str = Field(min_length=3, max_length=240)
    field_type: FormFieldType
    required: bool = True
    help_text: str | None = Field(default=None, max_length=500)
    options: list[str] | None = Field(default=None, max_length=20)
    scale_min: int | None = None
    scale_max: int | None = None


class FormSectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_id: str | None = Field(default=None, max_length=60)
    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=600)
    questions: list[FormQuestionRequest] = Field(min_length=1, max_length=60)


class ClinicalFormCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: str = Field(min_length=32, max_length=36)
    title: str = Field(min_length=3, max_length=180)
    subtitle: str | None = Field(default=None, max_length=300)
    header: str | None = Field(default=None, max_length=1500)
    sections: list[FormSectionRequest] = Field(min_length=1, max_length=20)


class ClinicalFormUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=3, max_length=180)
    subtitle: str | None = Field(default=None, max_length=300)
    header: str | None = Field(default=None, max_length=1500)
    sections: list[FormSectionRequest] | None = Field(default=None, min_length=1, max_length=20)


class ClinicalFormPsychologistActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: PsychologistFormAction
    scheduled_send_at: datetime | None = None
    review_note: str | None = Field(default=None, max_length=1000)


class ClinicalFormPatientActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: PatientFormAction
    answers: dict[str, object] | None = None


class FormQuestionResponse(BaseModel):
    question_id: str
    label: str
    field_type: FormFieldType
    required: bool
    help_text: str | None
    options: list[str] | None
    scale_min: int | None
    scale_max: int | None


class FormSectionResponse(BaseModel):
    section_id: str
    title: str
    description: str | None
    questions: list[FormQuestionResponse]


class ClinicalFormListItemResponse(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    psychologist_id: str
    source_template_id: str | None
    status: FormStatus
    title: str
    subtitle: str | None
    published_at: datetime | None
    scheduled_send_at: datetime | None
    assigned_at: datetime | None
    submitted_at: datetime | None
    reviewed_at: datetime | None


class ClinicalFormDetailResponse(ClinicalFormListItemResponse):
    tenant_id: str
    header: str | None
    sections: list[FormSectionResponse]
    response_data: dict[str, object] | None
    opened_at: datetime | None
    partial_saved_at: datetime | None
    reviewed_by_user_id: str | None
    review_note: str | None
    created_at: datetime
    updated_at: datetime


class ClinicalFormCreateResponse(ClinicalFormDetailResponse):
    patient_access_token: str
    patient_access_link: str


class ClinicalFormPublicListResponse(BaseModel):
    patient_id: str
    patient_name: str
    forms: list[ClinicalFormDetailResponse]


class ClinicalFormPublicActionResponse(BaseModel):
    form: ClinicalFormDetailResponse


class ClinicalFormTimelineEventResponse(BaseModel):
    id: str
    form_id: str | None
    patient_id: str | None
    event_type: str
    actor_type: str
    actor_id: str | None
    payload: dict[str, object]
    created_at: datetime


class FormsDispatchRunResponse(BaseModel):
    processed: int
    dispatched: int
