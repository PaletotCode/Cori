from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import AuthContext, get_auth_context, get_db, get_tenant_db
from app.models import PatientIntake, TimelineEvent
from app.schemas.triage import (
    IntakeCustomQuestion,
    IntakeDetailResponse,
    IntakeInviteCreateRequest,
    IntakeInviteCreateResponse,
    IntakeMode,
    IntakePublicSubmitRequest,
    IntakePublicSubmitResponse,
    IntakePublicViewResponse,
    IntakeQueueItemResponse,
    IntakeReviewRequest,
    IntakeReviewResponse,
    IntakeStatus,
    TimelineEventResponse,
)
from app.services.triage_service import TriageServiceError, triage_service

router = APIRouter(tags=["triage"])


def _parse_custom_questions(intake: PatientIntake) -> list[IntakeCustomQuestion]:
    custom_form_raw = intake.custom_form or []
    return [
        IntakeCustomQuestion.model_validate(question)
        for question in cast(list[dict[str, object]], custom_form_raw)
    ]


def _to_queue_item(intake: PatientIntake) -> IntakeQueueItemResponse:
    triage_answers = intake.triage_answers or {}
    return IntakeQueueItemResponse(
        intake_id=str(intake.id),
        mode=cast(IntakeMode, intake.mode),
        status=cast(IntakeStatus, intake.status),
        invite_expires_at=intake.invite_token_expires_at,
        opened_at=intake.opened_at,
        submitted_at=intake.submitted_at,
        patient_full_name=intake.patient_full_name,
        patient_email=intake.patient_email,
        patient_phone=intake.patient_phone,
        complement_request_note=intake.complement_request_note,
        activated_patient_id=str(intake.activated_patient_id)
        if intake.activated_patient_id is not None
        else None,
        has_triage_answers=len(triage_answers) > 0,
    )


def _to_detail(intake: PatientIntake) -> IntakeDetailResponse:
    return IntakeDetailResponse(
        intake_id=str(intake.id),
        mode=cast(IntakeMode, intake.mode),
        status=cast(IntakeStatus, intake.status),
        invite_expires_at=intake.invite_token_expires_at,
        opened_at=intake.opened_at,
        submitted_at=intake.submitted_at,
        reviewed_at=intake.reviewed_at,
        activated_at=intake.activated_at,
        patient_full_name=intake.patient_full_name,
        patient_email=intake.patient_email,
        patient_phone=intake.patient_phone,
        custom_questions=_parse_custom_questions(intake),
        triage_answers=intake.triage_answers,
        review_note=intake.review_note,
        complement_request_note=intake.complement_request_note,
        activated_patient_id=str(intake.activated_patient_id)
        if intake.activated_patient_id is not None
        else None,
    )


def _to_timeline_event(event: TimelineEvent) -> TimelineEventResponse:
    return TimelineEventResponse(
        id=str(event.id),
        intake_id=str(event.intake_id) if event.intake_id is not None else None,
        patient_id=str(event.patient_id) if event.patient_id is not None else None,
        event_type=event.event_type,
        actor_type=event.actor_type,
        actor_id=str(event.actor_id) if event.actor_id is not None else None,
        payload=event.payload,
        created_at=event.created_at,
    )


@router.post("/intakes/invites", response_model=IntakeInviteCreateResponse)
def create_intake_invite(
    payload: IntakeInviteCreateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> IntakeInviteCreateResponse:
    try:
        created = triage_service.create_invite(
            db,
            tenant_id=context.tenant_id,
            creator_user_id=context.user_id,
            payload=payload,
            invite_base_url=settings.patient_invite_base_url,
        )
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return IntakeInviteCreateResponse(
        intake_id=str(created.intake.id),
        mode=cast(IntakeMode, created.intake.mode),
        status=cast(IntakeStatus, created.intake.status),
        invite_token=created.invite_token,
        invite_link=created.invite_link,
        invite_expires_at=created.intake.invite_token_expires_at,
    )


@router.get("/intakes/queue", response_model=list[IntakeQueueItemResponse])
def list_intake_queue(
    statuses: str | None = Query(default=None, description="CSV de status"),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[IntakeQueueItemResponse]:
    parsed_statuses: set[str] | None = None
    if statuses:
        parsed_statuses = {chunk.strip() for chunk in statuses.split(",") if chunk.strip()}

    queue = triage_service.list_queue(db, tenant_id=context.tenant_id, statuses=parsed_statuses)
    return [_to_queue_item(item) for item in queue]


@router.get("/intakes/timeline-events", response_model=list[TimelineEventResponse])
def list_timeline_events(
    intake_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[TimelineEventResponse]:
    events = triage_service.list_timeline_events(
        db,
        tenant_id=context.tenant_id,
        intake_id=intake_id,
        limit=limit,
    )
    return [_to_timeline_event(event) for event in events]


@router.get("/intakes/{intake_id}", response_model=IntakeDetailResponse)
def get_intake_detail(
    intake_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> IntakeDetailResponse:
    intake = triage_service.get_intake_for_tenant(
        db, tenant_id=context.tenant_id, intake_id=intake_id
    )
    if intake is None:
        raise HTTPException(status_code=404, detail="Triagem nao encontrada.")

    return _to_detail(intake)


@router.post("/intakes/{intake_id}/review", response_model=IntakeReviewResponse)
def review_intake(
    intake_id: UUID,
    payload: IntakeReviewRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> IntakeReviewResponse:
    try:
        intake = triage_service.review_intake(
            db,
            tenant_id=context.tenant_id,
            reviewer_user_id=context.user_id,
            intake_id=intake_id,
            payload=payload,
        )
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return IntakeReviewResponse(
        intake_id=str(intake.id),
        status=cast(IntakeStatus, intake.status),
        reviewed_at=intake.reviewed_at,
        activated_patient_id=str(intake.activated_patient_id)
        if intake.activated_patient_id is not None
        else None,
    )


@router.get("/intake-links/{invite_token}", response_model=IntakePublicViewResponse)
def public_get_intake(invite_token: str, db: Session = Depends(get_db)) -> IntakePublicViewResponse:
    try:
        result = triage_service.get_public_intake(db, invite_token=invite_token)
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    intake = result.intake
    return IntakePublicViewResponse(
        intake_id=str(intake.id),
        mode=cast(IntakeMode, intake.mode),
        status=cast(IntakeStatus, intake.status),
        invite_expires_at=intake.invite_token_expires_at,
        practice_name=result.practice_name,
        invite_message=intake.invite_message,
        requires_custom_triage=intake.mode == "custom_triage",
        custom_questions=result.custom_questions,
        complement_request_note=intake.complement_request_note,
    )


@router.post("/intake-links/{invite_token}/submit", response_model=IntakePublicSubmitResponse)
def public_submit_intake(
    invite_token: str,
    payload: IntakePublicSubmitRequest,
    db: Session = Depends(get_db),
) -> IntakePublicSubmitResponse:
    try:
        intake = triage_service.submit_public_intake(
            db,
            invite_token=invite_token,
            payload=payload,
        )
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return IntakePublicSubmitResponse(
        intake_id=str(intake.id),
        status=cast(IntakeStatus, intake.status),
        submitted_at=intake.submitted_at,
    )
