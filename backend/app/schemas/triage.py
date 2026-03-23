from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

IntakeMode = Literal["simple_invite", "custom_triage"]
IntakeStatus = Literal[
    "pending_submission",
    "submitted",
    "complement_requested",
    "approved",
    "rejected",
    "expired",
]
ReviewAction = Literal["approve", "reject", "request_complement"]


class IntakeCustomQuestionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=3, max_length=180)
    required: bool = True


class IntakeCustomQuestion(BaseModel):
    question_id: str
    prompt: str
    required: bool


class IntakeInviteCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: IntakeMode
    expires_in_hours: int = Field(default=72, ge=1, le=720)
    invite_message: str | None = Field(default=None, max_length=500)
    access_code_alias: str | None = Field(default=None, max_length=60)
    custom_questions: list[IntakeCustomQuestionCreate] | None = Field(default=None, max_length=12)


class IntakeInviteCreateResponse(BaseModel):
    intake_id: str
    mode: IntakeMode
    status: IntakeStatus
    invite_token: str
    invite_link: str
    invite_expires_at: datetime
    access_code: str
    access_code_expires_at: datetime


class IntakePublicViewResponse(BaseModel):
    intake_id: str
    mode: IntakeMode
    status: IntakeStatus
    invite_expires_at: datetime
    practice_name: str | None
    invite_message: str | None
    requires_custom_triage: bool
    custom_questions: list[IntakeCustomQuestion]
    complement_request_note: str | None


class IntakePublicSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_full_name: str = Field(min_length=3, max_length=180)
    patient_preferred_name: str | None = Field(default=None, max_length=120)
    patient_email: str | None = Field(default=None, max_length=255)
    patient_phone: str | None = Field(default=None, max_length=40)
    patient_birth_date: date | None = None
    patient_pronouns: str | None = Field(default=None, max_length=60)
    patient_emergency_contact_name: str | None = Field(default=None, max_length=180)
    patient_emergency_contact_phone: str | None = Field(default=None, max_length=40)
    patient_communication_notes: str | None = Field(default=None, max_length=500)
    patient_profile_photo_url: str | None = Field(default=None, max_length=2048)
    patient_profile_banner_url: str | None = Field(default=None, max_length=2048)
    consent_terms_accepted: Literal[True]
    consent_privacy_accepted: Literal[True]
    triage_answers: dict[str, str] | None = None


class IntakePublicSubmitResponse(BaseModel):
    intake_id: str
    status: IntakeStatus
    submitted_at: datetime | None


class IntakeQueueItemResponse(BaseModel):
    intake_id: str
    mode: IntakeMode
    status: IntakeStatus
    invite_expires_at: datetime
    access_code_expires_at: datetime | None
    opened_at: datetime | None
    submitted_at: datetime | None
    patient_full_name: str | None
    patient_preferred_name: str | None
    patient_email: str | None
    patient_phone: str | None
    patient_birth_date: date | None
    patient_pronouns: str | None
    patient_emergency_contact_name: str | None
    patient_emergency_contact_phone: str | None
    patient_profile_photo_url: str | None
    patient_profile_banner_url: str | None
    complement_request_note: str | None
    activated_patient_id: str | None
    has_triage_answers: bool


class IntakeQueueSummaryResponse(BaseModel):
    total: int
    actionable: int
    pending_submission: int
    submitted: int
    complement_requested: int
    approved: int
    rejected: int
    expired: int


class IntakeDetailResponse(BaseModel):
    intake_id: str
    mode: IntakeMode
    status: IntakeStatus
    invite_expires_at: datetime
    access_code_expires_at: datetime | None
    opened_at: datetime | None
    submitted_at: datetime | None
    reviewed_at: datetime | None
    activated_at: datetime | None
    patient_full_name: str | None
    patient_preferred_name: str | None
    patient_email: str | None
    patient_phone: str | None
    patient_birth_date: date | None
    patient_pronouns: str | None
    patient_emergency_contact_name: str | None
    patient_emergency_contact_phone: str | None
    patient_communication_notes: str | None
    patient_profile_photo_url: str | None
    patient_profile_banner_url: str | None
    custom_questions: list[IntakeCustomQuestion]
    triage_answers: dict[str, str] | None
    review_note: str | None
    complement_request_note: str | None
    activated_patient_id: str | None


class IntakeReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: ReviewAction
    note: str | None = Field(default=None, max_length=500)


class IntakeReviewResponse(BaseModel):
    intake_id: str
    status: IntakeStatus
    reviewed_at: datetime | None
    activated_patient_id: str | None


class IntakeAccessCodeRotateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alias: str | None = Field(default=None, max_length=60)


class IntakeAccessCodeRotateResponse(BaseModel):
    intake_id: str
    access_code: str
    access_code_expires_at: datetime


class IntakeAccessCodeValidateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=7, max_length=64)


class IntakeAccessCodeValidateResponse(BaseModel):
    valid: bool
    message: str
    intake_id: str | None = None
    tenant_id: str | None = None
    status: IntakeStatus | None = None
    mode: IntakeMode | None = None


class IntakeAccessCodeActivateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=7, max_length=64)


class IntakeAccessCodeActivateResponse(BaseModel):
    access_granted: bool
    message: str
    intake_id: str | None = None
    status: IntakeStatus | None = None
    mode: IntakeMode | None = None
    patient_id: str | None = None
    tenant_id: str | None = None
    patient_access_token: str | None = None
    patient_access_expires_at: datetime | None = None


class TimelineEventResponse(BaseModel):
    id: str
    intake_id: str | None
    patient_id: str | None
    event_type: str
    actor_type: str
    actor_id: str | None
    payload: dict[str, object]
    created_at: datetime
