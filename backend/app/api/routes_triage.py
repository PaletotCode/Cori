from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import (
    AuthContext,
    get_auth_context,
    get_db,
    get_patient_auth_context,
    get_tenant_db,
    get_tenant_db_for_patient,
)
from app.models import PatientIntake, TimelineEvent
from app.schemas.triage import (
    IntakeAccessCodeActivateRequest,
    IntakeAccessCodeActivateResponse,
    IntakeAccessCodeRotateRequest,
    IntakeAccessCodeRotateResponse,
    IntakeAccessCodeValidateRequest,
    IntakeAccessCodeValidateResponse,
    IntakeCustomQuestion,
    IntakeDetailResponse,
    IntakeInviteCreateRequest,
    IntakeInviteCreateResponse,
    IntakeMode,
    IntakePublicSubmitRequest,
    IntakePublicSubmitResponse,
    IntakePublicViewResponse,
    IntakeQueueItemResponse,
    IntakeQueueSummaryResponse,
    IntakeReviewRequest,
    IntakeReviewResponse,
    IntakeStatus,
    TimelineEventResponse,
)
from app.services.realtime_hub import realtime_hub
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
        access_code_expires_at=intake.access_code_expires_at,
        opened_at=intake.opened_at,
        submitted_at=intake.submitted_at,
        patient_full_name=intake.patient_full_name,
        patient_preferred_name=intake.patient_preferred_name,
        patient_email=intake.patient_email,
        patient_phone=intake.patient_phone,
        patient_birth_date=intake.patient_birth_date,
        patient_pronouns=intake.patient_pronouns,
        patient_emergency_contact_name=intake.patient_emergency_contact_name,
        patient_emergency_contact_phone=intake.patient_emergency_contact_phone,
        patient_profile_photo_url=intake.patient_profile_photo_url,
        patient_profile_banner_url=intake.patient_profile_banner_url,
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
        access_code_expires_at=intake.access_code_expires_at,
        opened_at=intake.opened_at,
        submitted_at=intake.submitted_at,
        reviewed_at=intake.reviewed_at,
        activated_at=intake.activated_at,
        patient_full_name=intake.patient_full_name,
        patient_preferred_name=intake.patient_preferred_name,
        patient_email=intake.patient_email,
        patient_phone=intake.patient_phone,
        patient_birth_date=intake.patient_birth_date,
        patient_pronouns=intake.patient_pronouns,
        patient_emergency_contact_name=intake.patient_emergency_contact_name,
        patient_emergency_contact_phone=intake.patient_emergency_contact_phone,
        patient_communication_notes=intake.patient_communication_notes,
        patient_profile_photo_url=intake.patient_profile_photo_url,
        patient_profile_banner_url=intake.patient_profile_banner_url,
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


def _build_triage_status_notification(intake: PatientIntake) -> tuple[str, str, str]:
    patient_name = intake.patient_full_name or "Paciente"
    if intake.status == "submitted":
        return (
            "intake_submitted",
            "Nova triagem pendente",
            f"{patient_name} enviou a triagem inicial e aguarda revisao.",
        )
    if intake.status == "approved":
        return (
            "intake_approved",
            "Triagem aprovada",
            f"{patient_name} foi aprovado e pode seguir para o acesso oficial.",
        )
    if intake.status == "rejected":
        return (
            "intake_rejected",
            "Triagem rejeitada",
            f"{patient_name} nao foi aprovado na triagem inicial.",
        )
    if intake.status == "complement_requested":
        return (
            "intake_complement_requested",
            "Complemento solicitado",
            f"Foi solicitado complemento de triagem para {patient_name}.",
        )
    return (
        "intake_updated",
        "Triagem atualizada",
        f"Triagem de {patient_name} atualizada para {intake.status}.",
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
        access_code=created.access_code,
        access_code_expires_at=created.intake.access_code_expires_at
        or created.intake.invite_token_expires_at,
    )


@router.get("/intake-links/{invite_token}", response_model=IntakePublicViewResponse)
def get_public_intake_view(
    invite_token: str,
    db: Session = Depends(get_db),
) -> IntakePublicViewResponse:
    try:
        result = triage_service.get_public_intake(db, invite_token=invite_token.strip())
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return IntakePublicViewResponse(
        intake_id=str(result.intake.id),
        mode=cast(IntakeMode, result.intake.mode),
        status=cast(IntakeStatus, result.intake.status),
        invite_expires_at=result.intake.invite_token_expires_at,
        practice_name=result.practice_name,
        invite_message=result.intake.invite_message,
        requires_custom_triage=result.intake.mode == "custom_triage",
        custom_questions=result.custom_questions,
        complement_request_note=result.intake.complement_request_note,
    )


@router.post("/intake-links/{invite_token}/submit", response_model=IntakePublicSubmitResponse)
async def submit_public_intake(
    invite_token: str,
    payload: IntakePublicSubmitRequest,
    db: Session = Depends(get_db),
) -> IntakePublicSubmitResponse:
    try:
        intake = triage_service.submit_public_intake(
            db,
            invite_token=invite_token.strip(),
            payload=payload,
        )
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    event_type, title, body = _build_triage_status_notification(intake)
    await realtime_hub.broadcast_notification(
        tenant_id=intake.tenant_id,
        title=title,
        body=body,
        event_type=event_type,
        category="triage",
        entity_type="intake",
        entity_id=str(intake.id),
        metadata={
            "intake_id": str(intake.id),
            "mode": intake.mode,
            "status": intake.status,
        },
    )

    return IntakePublicSubmitResponse(
        intake_id=str(intake.id),
        status=cast(IntakeStatus, intake.status),
        submitted_at=intake.submitted_at,
    )


@router.get("/intakes/patient/me", response_model=IntakeDetailResponse)
def get_authenticated_patient_intake(
    context: AuthContext = Depends(get_patient_auth_context),
    db: Session = Depends(get_tenant_db_for_patient),
) -> IntakeDetailResponse:
    try:
        intake = triage_service.get_authenticated_patient_intake(
            db,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
        )
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_detail(intake)


@router.post("/intakes/patient/me/submit", response_model=IntakePublicSubmitResponse)
async def submit_authenticated_patient_intake(
    payload: IntakePublicSubmitRequest,
    context: AuthContext = Depends(get_patient_auth_context),
    db: Session = Depends(get_tenant_db_for_patient),
) -> IntakePublicSubmitResponse:
    try:
        intake = triage_service.submit_authenticated_patient_intake(
            db,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
            payload=payload,
        )
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    event_type, title, body = _build_triage_status_notification(intake)
    await realtime_hub.broadcast_notification(
        tenant_id=intake.tenant_id,
        title=title,
        body=body,
        event_type=event_type,
        category="triage",
        entity_type="intake",
        entity_id=str(intake.id),
        metadata={
            "intake_id": str(intake.id),
            "mode": intake.mode,
            "status": intake.status,
        },
    )
    return IntakePublicSubmitResponse(
        intake_id=str(intake.id),
        status=cast(IntakeStatus, intake.status),
        submitted_at=intake.submitted_at,
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


@router.get("/intakes/queue/summary", response_model=IntakeQueueSummaryResponse)
def get_intake_queue_summary(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> IntakeQueueSummaryResponse:
    summary = triage_service.queue_summary(db, tenant_id=context.tenant_id)
    return IntakeQueueSummaryResponse(
        total=summary["total"],
        actionable=summary["actionable"],
        pending_submission=summary["pending_submission"],
        submitted=summary["submitted"],
        complement_requested=summary["complement_requested"],
        approved=summary["approved"],
        rejected=summary["rejected"],
        expired=summary["expired"],
    )


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


@router.post(
    "/intakes/access-codes/validate",
    response_model=IntakeAccessCodeValidateResponse,
)
def validate_access_code(
    payload: IntakeAccessCodeValidateRequest,
    db: Session = Depends(get_db),
) -> IntakeAccessCodeValidateResponse:
    result = triage_service.validate_access_code(db, code=payload.code)
    if not result.valid or result.intake is None:
        return IntakeAccessCodeValidateResponse(
            valid=False,
            message=result.message,
        )

    return IntakeAccessCodeValidateResponse(
        valid=True,
        message=result.message,
        intake_id=str(result.intake.id),
        tenant_id=str(result.intake.tenant_id),
        status=cast(IntakeStatus, result.intake.status),
        mode=cast(IntakeMode, result.intake.mode),
    )


@router.post(
    "/intakes/access-codes/activate",
    response_model=IntakeAccessCodeActivateResponse,
)
async def activate_access_code(
    payload: IntakeAccessCodeActivateRequest,
    db: Session = Depends(get_db),
) -> IntakeAccessCodeActivateResponse:
    try:
        result = triage_service.activate_patient_access_by_code(db, code=payload.code)
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    if result.intake is None:
        return IntakeAccessCodeActivateResponse(
            access_granted=False,
            message=result.message,
        )

    response = IntakeAccessCodeActivateResponse(
        access_granted=result.access_granted,
        message=result.message,
        intake_id=str(result.intake.id),
        status=cast(IntakeStatus, result.intake.status),
        mode=cast(IntakeMode, result.intake.mode),
        patient_id=str(result.patient.id) if result.patient is not None else None,
        tenant_id=str(result.intake.tenant_id),
        patient_access_token=result.patient_access_token,
        patient_access_expires_at=result.patient_access_expires_at,
    )

    if not result.access_granted or result.patient is None or result.patient_access_token is None:
        return response

    await realtime_hub.broadcast_notification(
        tenant_id=result.intake.tenant_id,
        patient_id=result.patient.id,
        title="Acesso liberado para paciente",
        body=(
            f"{result.patient.full_name} recebeu acesso oficial e pode entrar "
            "no aplicativo."
        ),
        event_type="intake_patient_access_granted",
        category="triage",
        entity_type="intake",
        entity_id=str(result.intake.id),
        metadata={
            "intake_id": str(result.intake.id),
            "patient_id": str(result.patient.id),
            "status": result.intake.status,
            "patient_access_expires_at": (
                result.patient_access_expires_at.isoformat()
                if result.patient_access_expires_at is not None
                else None
            ),
        },
    )
    return response


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
async def review_intake(
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

    event_type, title, body = _build_triage_status_notification(intake)
    await realtime_hub.broadcast_notification(
        tenant_id=intake.tenant_id,
        patient_id=intake.activated_patient_id,
        title=title,
        body=body,
        event_type=event_type,
        category="triage",
        entity_type="intake",
        entity_id=str(intake.id),
        metadata={
            "intake_id": str(intake.id),
            "status": intake.status,
            "mode": intake.mode,
            "review_note": intake.review_note,
            "complement_request_note": intake.complement_request_note,
        },
    )

    return IntakeReviewResponse(
        intake_id=str(intake.id),
        status=cast(IntakeStatus, intake.status),
        reviewed_at=intake.reviewed_at,
        activated_patient_id=str(intake.activated_patient_id)
        if intake.activated_patient_id is not None
        else None,
    )


@router.post(
    "/intakes/{intake_id}/access-code/rotate",
    response_model=IntakeAccessCodeRotateResponse,
)
def rotate_access_code(
    intake_id: UUID,
    payload: IntakeAccessCodeRotateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> IntakeAccessCodeRotateResponse:
    try:
        intake, access_code = triage_service.rotate_access_code(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            intake_id=intake_id,
            alias=payload.alias,
        )
    except TriageServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return IntakeAccessCodeRotateResponse(
        intake_id=str(intake.id),
        access_code=access_code,
        access_code_expires_at=intake.access_code_expires_at or intake.invite_token_expires_at,
    )
