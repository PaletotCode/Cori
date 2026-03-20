from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext, get_auth_context, get_tenant_db
from app.models import Activity, ActivityTemplate
from app.schemas.activity import (
    ActivityDetailResponse,
    ActivityRecurrenceRule,
    ActivityStatus,
    ActivityType,
)
from app.schemas.template import (
    ActivityTemplateAssignRequest,
    ActivityTemplateAssignResponse,
    ActivityTemplateCreateRequest,
    ActivityTemplateResponse,
    ActivityTemplateUpdateRequest,
)
from app.services.notification_service import notification_service
from app.services.template_assignment_service import (
    TemplateAssignmentServiceError,
    template_assignment_service,
)

router = APIRouter(tags=["activity-templates"])


def _to_template_response(template: ActivityTemplate) -> ActivityTemplateResponse:
    return ActivityTemplateResponse(
        id=str(template.id),
        tenant_id=str(template.tenant_id),
        psychologist_id=str(template.psychologist_id),
        title=template.title,
        description=template.description,
        instructions=template.instructions,
        document_url=template.document_url,
        configuration=template.configuration,
        activity_type=cast(ActivityType, template.activity_type),
        created_at=template.created_at,
        updated_at=template.updated_at,
        archived_at=template.archived_at,
    )


def _to_activity_detail(activity: Activity) -> ActivityDetailResponse:
    patient_name = activity.patient.full_name if activity.patient is not None else "Paciente"
    return ActivityDetailResponse(
        id=str(activity.id),
        patient_id=str(activity.patient_id),
        patient_name=patient_name,
        psychologist_id=str(activity.psychologist_id),
        source_template_id=str(activity.source_template_id)
        if activity.source_template_id is not None
        else None,
        activity_type=cast(ActivityType, activity.activity_type),
        status=cast(ActivityStatus, activity.status),
        title=activity.title,
        due_at=activity.due_at,
        scheduled_send_at=activity.scheduled_send_at,
        assigned_at=activity.assigned_at,
        overdue_at=activity.overdue_at,
        recurrence_rule=cast(ActivityRecurrenceRule, activity.recurrence_rule),
        recurrence_interval=activity.recurrence_interval,
        recurrence_end_at=activity.recurrence_end_at,
        execution_elapsed_seconds=activity.execution_elapsed_seconds,
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


@router.post("/activity-templates", response_model=ActivityTemplateResponse)
def create_activity_template(
    payload: ActivityTemplateCreateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityTemplateResponse:
    try:
        template = template_assignment_service.create_activity_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            payload=payload,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_template_response(template)


@router.get("/activity-templates", response_model=list[ActivityTemplateResponse])
def list_activity_templates(
    include_archived: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[ActivityTemplateResponse]:
    templates = template_assignment_service.list_activity_templates(
        db,
        tenant_id=context.tenant_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return [_to_template_response(item) for item in templates]


@router.get("/activity-templates/{template_id}", response_model=ActivityTemplateResponse)
def get_activity_template(
    template_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityTemplateResponse:
    template = template_assignment_service.get_activity_template(
        db,
        tenant_id=context.tenant_id,
        template_id=template_id,
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template de atividade nao encontrado.")
    return _to_template_response(template)


@router.patch("/activity-templates/{template_id}", response_model=ActivityTemplateResponse)
def patch_activity_template(
    template_id: UUID,
    payload: ActivityTemplateUpdateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityTemplateResponse:
    try:
        template = template_assignment_service.update_activity_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            template_id=template_id,
            payload=payload,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_template_response(template)


@router.delete("/activity-templates/{template_id}", response_model=ActivityTemplateResponse)
def archive_activity_template(
    template_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityTemplateResponse:
    try:
        template = template_assignment_service.archive_activity_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            template_id=template_id,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_template_response(template)


@router.post(
    "/activity-templates/{template_id}/assign",
    response_model=ActivityTemplateAssignResponse,
)
async def assign_activity_template(
    template_id: UUID,
    payload: ActivityTemplateAssignRequest,
    idempotency_key: str = Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=200,
    ),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ActivityTemplateAssignResponse:
    try:
        result = template_assignment_service.assign_activity_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            template_id=template_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    if not result.replayed and result.activity.status == "assigned":
        await notification_service.emit_domain_notification(
            db,
            tenant_id=context.tenant_id,
            patient_id=result.activity.patient_id,
            event_type="activity_assigned",
            title="Nova atividade atribuida",
            body=f"Atividade '{result.activity.title}' enviada para voce.",
            metadata={
                "activity_id": str(result.activity.id),
                "source_template_id": str(result.activity.source_template_id)
                if result.activity.source_template_id is not None
                else None,
                "send_mode": payload.send_mode,
                "template_id": str(template_id),
            },
        )

    return ActivityTemplateAssignResponse(
        idempotency_replayed=result.replayed,
        activity=_to_activity_detail(result.activity),
    )
