from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import AuthContext, get_auth_context, get_db, get_tenant_db
from app.models import Activity, TimelineEvent
from app.schemas.activity import (
    ActivityCreateRequest,
    ActivityCreateResponse,
    ActivityDetailResponse,
    ActivityListItemResponse,
    ActivityOverdueRunResponse,
    ActivityPatientActionRequest,
    ActivityPsychologistActionRequest,
    ActivityPublicActionResponse,
    ActivityPublicListResponse,
    ActivityRecurrenceRule,
    ActivityStatus,
    ActivityTimelineEventResponse,
    ActivityType,
    ActivityUpdateRequest,
)
from app.services.activity_service import ActivityServiceError, activity_service
from app.services.notification_service import notification_service

router = APIRouter(tags=["activities"])


def _to_list_item(activity: Activity) -> ActivityListItemResponse:
    patient_name = activity.patient.full_name if activity.patient is not None else "Paciente"
    return ActivityListItemResponse(
        id=str(activity.id),
        patient_id=str(activity.patient_id),
        patient_name=patient_name,
        psychologist_id=str(activity.psychologist_id),
        activity_type=cast(ActivityType, activity.activity_type),
        status=cast(ActivityStatus, activity.status),
        title=activity.title,
        due_at=activity.due_at,
        assigned_at=activity.assigned_at,
        overdue_at=activity.overdue_at,
        recurrence_rule=cast(ActivityRecurrenceRule, activity.recurrence_rule),
        recurrence_interval=activity.recurrence_interval,
        recurrence_end_at=activity.recurrence_end_at,
        execution_elapsed_seconds=activity.execution_elapsed_seconds,
    )


def _to_detail(activity: Activity) -> ActivityDetailResponse:
    return ActivityDetailResponse(
        **_to_list_item(activity).model_dump(),
        tenant_id=str(activity.tenant_id),
        description=activity.description,
        instructions=activity.instructions,
        document_url=activity.document_url,
        configuration=activity.configuration,
        opened_at=activity.opened_at,
        started_at=activity.started_at,
        paused_at=activity.paused_at,
        completed_at=activity.completed_at,
        canceled_at=activity.canceled_at,
        feedback_note=activity.feedback_note,
        created_at=activity.created_at,
        updated_at=activity.updated_at,
    )


def _to_timeline_event(event: TimelineEvent) -> ActivityTimelineEventResponse:
    return ActivityTimelineEventResponse(
        id=str(event.id),
        activity_id=str(event.activity_id) if event.activity_id is not None else None,
        patient_id=str(event.patient_id) if event.patient_id is not None else None,
        event_type=event.event_type,
        actor_type=event.actor_type,
        actor_id=str(event.actor_id) if event.actor_id is not None else None,
        payload=event.payload,
        created_at=event.created_at,
    )


@router.post("/activities", response_model=ActivityCreateResponse)
async def create_activity(
    payload: ActivityCreateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityCreateResponse:
    try:
        created = activity_service.create_activity(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            payload=payload,
            patient_activities_base_url=settings.patient_activities_base_url,
        )
    except ActivityServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    await notification_service.emit_domain_notification(
        db,
        tenant_id=context.tenant_id,
        patient_id=created.activity.patient_id,
        event_type="activity_assigned",
        title="Nova atividade atribuida",
        body=(
            f"Atividade '{created.activity.title}' atribuida para "
            f"{created.activity.patient.full_name if created.activity.patient else 'Paciente'}."
        ),
        metadata={"activity_id": str(created.activity.id)},
    )

    detail = _to_detail(created.activity)
    return ActivityCreateResponse(
        **detail.model_dump(),
        patient_access_token=created.patient_access_token,
        patient_access_link=created.patient_access_link,
    )


@router.get("/activities", response_model=list[ActivityListItemResponse])
def list_activities(
    patient_id: UUID | None = Query(default=None),
    status_filter: ActivityStatus | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[ActivityListItemResponse]:
    activities = activity_service.list_activities(
        db,
        tenant_id=context.tenant_id,
        patient_id=patient_id,
        status_filter=status_filter,
        limit=limit,
    )
    return [_to_list_item(activity) for activity in activities]


@router.get("/activities/{activity_id}", response_model=ActivityDetailResponse)
def get_activity(
    activity_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityDetailResponse:
    activity = activity_service.get_activity_for_tenant(
        db,
        tenant_id=context.tenant_id,
        activity_id=activity_id,
    )
    if activity is None:
        raise HTTPException(status_code=404, detail="Atividade nao encontrada.")
    return _to_detail(activity)


@router.patch("/activities/{activity_id}", response_model=ActivityDetailResponse)
def update_activity(
    activity_id: UUID,
    payload: ActivityUpdateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityDetailResponse:
    try:
        updated = activity_service.update_activity(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            activity_id=activity_id,
            payload=payload,
        )
    except ActivityServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_detail(updated)


@router.post("/activities/{activity_id}/actions", response_model=ActivityDetailResponse)
async def apply_psychologist_activity_action(
    activity_id: UUID,
    payload: ActivityPsychologistActionRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityDetailResponse:
    try:
        activity = activity_service.apply_psychologist_action(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            activity_id=activity_id,
            payload=payload,
        )
    except ActivityServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    labels = {
        "resend": ("activity_resend", "Atividade reenviada"),
        "reopen": ("activity_reopen", "Atividade reaberta"),
        "cancel": ("activity_cancel", "Atividade cancelada"),
    }
    event_type, title = labels[payload.action]
    await notification_service.emit_domain_notification(
        db,
        tenant_id=context.tenant_id,
        patient_id=activity.patient_id,
        event_type=event_type,
        title=title,
        body=f"Atividade '{activity.title}' atualizada para status {activity.status}.",
        metadata={"activity_id": str(activity.id), "status": activity.status},
    )
    return _to_detail(activity)


@router.get(
    "/activities/{activity_id}/timeline-events",
    response_model=list[ActivityTimelineEventResponse],
)
def list_activity_timeline_events(
    activity_id: UUID,
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[ActivityTimelineEventResponse]:
    activity = activity_service.get_activity_for_tenant(
        db,
        tenant_id=context.tenant_id,
        activity_id=activity_id,
    )
    if activity is None:
        raise HTTPException(status_code=404, detail="Atividade nao encontrada.")

    events = activity_service.list_activity_timeline_events(
        db,
        tenant_id=context.tenant_id,
        activity_id=activity_id,
        limit=limit,
    )
    return [_to_timeline_event(event) for event in events]


@router.get(
    "/activity-links/{patient_access_token}/activities",
    response_model=ActivityPublicListResponse,
)
def public_list_activities(
    patient_access_token: str,
    db: Session = Depends(get_db),
) -> ActivityPublicListResponse:
    try:
        patient, activities = activity_service.list_public_activities_by_token(
            db,
            patient_access_token=patient_access_token,
        )
    except ActivityServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return ActivityPublicListResponse(
        patient_id=str(patient.id),
        patient_name=patient.full_name,
        activities=[_to_list_item(activity) for activity in activities],
    )


@router.post(
    "/activity-links/{patient_access_token}/activities/{activity_id}/actions",
    response_model=ActivityPublicActionResponse,
)
async def public_apply_activity_action(
    patient_access_token: str,
    activity_id: UUID,
    payload: ActivityPatientActionRequest,
    db: Session = Depends(get_db),
) -> ActivityPublicActionResponse:
    try:
        result = activity_service.apply_public_action(
            db,
            patient_access_token=patient_access_token,
            activity_id=activity_id,
            payload=payload,
            patient_activities_base_url=settings.patient_activities_base_url,
        )
    except ActivityServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    await notification_service.emit_domain_notification(
        db,
        tenant_id=result.activity.tenant_id,
        patient_id=result.activity.patient_id,
        event_type=f"activity_{payload.action}",
        title="Progresso de atividade",
        body=(
            f"Atividade '{result.activity.title}' agora esta em status "
            f"{result.activity.status}."
        ),
        metadata={"activity_id": str(result.activity.id), "status": result.activity.status},
    )
    if result.recurring_assignment is not None:
        await notification_service.emit_domain_notification(
            db,
            tenant_id=result.recurring_assignment.activity.tenant_id,
            patient_id=result.recurring_assignment.activity.patient_id,
            event_type="activity_assigned",
            title="Nova atividade recorrente",
            body=(
                f"Nova recorrencia criada para '{result.recurring_assignment.activity.title}'."
            ),
            metadata={"activity_id": str(result.recurring_assignment.activity.id)},
        )

    return ActivityPublicActionResponse(activity=_to_detail(result.activity))


@router.post(
    "/scheduler/activities-overdue/run",
    response_model=ActivityOverdueRunResponse,
)
def run_overdue_scheduler(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityOverdueRunResponse:
    result = activity_service.mark_overdue_activities(
        db,
        tenant_id=context.tenant_id,
    )
    return ActivityOverdueRunResponse(
        processed=result.processed,
        marked_overdue=result.marked_overdue,
    )
