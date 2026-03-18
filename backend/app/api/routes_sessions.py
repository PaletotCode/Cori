from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import AuthContext, get_auth_context, get_db, get_tenant_db
from app.models import Session as ClinicalSession
from app.models import TimelineEvent
from app.schemas.session import (
    AgendaView,
    SessionActionRequest,
    SessionAgendaItemResponse,
    SessionCreateRequest,
    SessionCreateResponse,
    SessionDetailResponse,
    SessionLocationMode,
    SessionPublicConfirmResponse,
    SessionPublicListResponse,
    SessionReminderRunResponse,
    SessionStatus,
)
from app.schemas.triage import TimelineEventResponse
from app.services.notification_service import notification_service
from app.services.session_service import SessionServiceError, session_service

router = APIRouter(tags=["sessions"])


def _to_agenda_item(clinical_session: ClinicalSession) -> SessionAgendaItemResponse:
    patient_name = clinical_session.patient.full_name if clinical_session.patient else "Paciente"
    return SessionAgendaItemResponse(
        id=str(clinical_session.id),
        patient_id=str(clinical_session.patient_id),
        patient_name=patient_name,
        psychologist_id=str(clinical_session.psychologist_id),
        status=cast(SessionStatus, clinical_session.status),
        location_mode=cast(SessionLocationMode, clinical_session.location_mode),
        scheduled_start_at=clinical_session.scheduled_start_at,
        scheduled_end_at=clinical_session.scheduled_end_at,
        confirmation_token_expires_at=clinical_session.confirmation_token_expires_at,
    )


def _to_detail(clinical_session: ClinicalSession) -> SessionDetailResponse:
    patient_name = clinical_session.patient.full_name if clinical_session.patient else "Paciente"
    return SessionDetailResponse(
        id=str(clinical_session.id),
        tenant_id=str(clinical_session.tenant_id),
        patient_id=str(clinical_session.patient_id),
        patient_name=patient_name,
        psychologist_id=str(clinical_session.psychologist_id),
        status=cast(SessionStatus, clinical_session.status),
        location_mode=cast(SessionLocationMode, clinical_session.location_mode),
        scheduled_start_at=clinical_session.scheduled_start_at,
        scheduled_end_at=clinical_session.scheduled_end_at,
        meeting_link=clinical_session.meeting_link,
        notes=clinical_session.notes,
        cancellation_reason=clinical_session.cancellation_reason,
        canceled_at=clinical_session.canceled_at,
        confirmed_at=clinical_session.confirmed_at,
        confirmed_by=clinical_session.confirmed_by,
        rescheduled_at=clinical_session.rescheduled_at,
        confirmation_token_expires_at=clinical_session.confirmation_token_expires_at,
        created_at=clinical_session.created_at,
        updated_at=clinical_session.updated_at,
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


@router.post("/sessions", response_model=SessionCreateResponse)
async def create_session(
    payload: SessionCreateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> SessionCreateResponse:
    try:
        created = session_service.create_session(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            payload=payload,
            patient_sessions_base_url=settings.patient_sessions_base_url,
        )
    except SessionServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    patient_name = (
        created.session.patient.full_name if created.session.patient is not None else "Paciente"
    )
    await notification_service.emit_domain_notification(
        db,
        tenant_id=context.tenant_id,
        patient_id=created.session.patient_id,
        event_type="session_created",
        title="Nova sessao agendada",
        body=f"Sessao criada para {patient_name}.",
        metadata={"session_id": str(created.session.id)},
    )

    detail = _to_detail(created.session)
    return SessionCreateResponse(
        **detail.model_dump(),
        confirmation_token=created.confirmation_token,
        confirmation_link=created.confirmation_link,
    )


@router.get("/agenda", response_model=list[SessionAgendaItemResponse])
def list_agenda(
    view: AgendaView = Query(default="week"),
    reference_date: date = Query(default_factory=lambda: datetime.now(UTC).date()),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[SessionAgendaItemResponse]:
    sessions = session_service.list_agenda(
        db,
        tenant_id=context.tenant_id,
        view=view,
        reference_date=reference_date,
    )
    return [_to_agenda_item(item) for item in sessions]


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session_detail(
    session_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> SessionDetailResponse:
    clinical_session = session_service.get_session_for_tenant(
        db,
        tenant_id=context.tenant_id,
        session_id=session_id,
    )
    if clinical_session is None:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada.")
    return _to_detail(clinical_session)


@router.post("/sessions/{session_id}/actions", response_model=SessionDetailResponse)
async def apply_session_action(
    session_id: UUID,
    payload: SessionActionRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> SessionDetailResponse:
    try:
        clinical_session = session_service.apply_action(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            session_id=session_id,
            payload=payload,
        )
    except SessionServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    patient_name = (
        clinical_session.patient.full_name
        if clinical_session.patient is not None
        else "Paciente"
    )
    await notification_service.emit_domain_notification(
        db,
        tenant_id=context.tenant_id,
        patient_id=clinical_session.patient_id,
        event_type=f"session_{payload.action}",
        title="Sessao atualizada",
        body=f"Sessao de {patient_name} atualizada para status {clinical_session.status}.",
        metadata={"session_id": str(clinical_session.id), "status": clinical_session.status},
    )
    return _to_detail(clinical_session)


@router.get("/sessions/{session_id}/timeline-events", response_model=list[TimelineEventResponse])
def list_session_timeline_events(
    session_id: UUID,
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[TimelineEventResponse]:
    clinical_session = session_service.get_session_for_tenant(
        db,
        tenant_id=context.tenant_id,
        session_id=session_id,
    )
    if clinical_session is None:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada.")

    events = session_service.list_session_timeline_events(
        db,
        tenant_id=context.tenant_id,
        session_id=session_id,
        limit=limit,
    )
    return [_to_timeline_event(event) for event in events]


@router.get(
    "/session-links/{confirmation_token}/sessions",
    response_model=SessionPublicListResponse,
)
def public_list_sessions(
    confirmation_token: str,
    db: Session = Depends(get_db),
) -> SessionPublicListResponse:
    try:
        patient, sessions = session_service.list_public_sessions_by_token(
            db,
            confirmation_token=confirmation_token,
        )
    except SessionServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return SessionPublicListResponse(
        patient_id=str(patient.id),
        patient_name=patient.full_name,
        sessions=[_to_agenda_item(item) for item in sessions],
    )


@router.post(
    "/session-links/{confirmation_token}/sessions/{session_id}/confirm",
    response_model=SessionPublicConfirmResponse,
)
async def public_confirm_session(
    confirmation_token: str,
    session_id: UUID,
    db: Session = Depends(get_db),
) -> SessionPublicConfirmResponse:
    try:
        clinical_session = session_service.confirm_public_session(
            db,
            confirmation_token=confirmation_token,
            session_id=session_id,
        )
    except SessionServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    await notification_service.emit_domain_notification(
        db,
        tenant_id=clinical_session.tenant_id,
        patient_id=clinical_session.patient_id,
        event_type="session_confirmed_by_patient",
        title="Paciente confirmou presenca",
        body=(
            f"{clinical_session.patient.full_name if clinical_session.patient else 'Paciente'} "
            "confirmou a sessao."
        ),
        metadata={"session_id": str(clinical_session.id)},
    )
    return SessionPublicConfirmResponse(
        session_id=str(clinical_session.id),
        status=cast(SessionStatus, clinical_session.status),
        confirmed_at=clinical_session.confirmed_at,
    )


@router.post("/scheduler/session-reminders/run", response_model=SessionReminderRunResponse)
async def run_session_reminders(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> SessionReminderRunResponse:
    result = session_service.run_due_reminders_job(
        db,
        tenant_id=context.tenant_id,
    )
    for notification in result.notifications:
        await notification_service.emit_domain_notification(
            db,
            tenant_id=notification.tenant_id,
            patient_id=notification.patient_id,
            event_type=notification.event_type,
            title=notification.title,
            body=notification.body,
            metadata={"session_id": str(notification.session_id)},
        )
    return SessionReminderRunResponse(
        processed=result.processed,
        sent=result.sent,
        failed=result.failed,
    )
