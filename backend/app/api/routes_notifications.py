from typing import Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext, get_auth_context, get_db, get_tenant_db
from app.models import NotificationDelivery, TimelineEvent
from app.schemas.notification import (
    NotificationCategory,
    NotificationDeliveryResponse,
    NotificationDeliveryStatus,
    NotificationInboxActionRequest,
    NotificationRuleCategory,
    NotificationRuleResponse,
    NotificationRuleUpsertRequest,
    PatientDocumentEventRequest,
    PatientInboxResponse,
    PsychologistDocumentEventRequest,
    UnifiedTimelineEventResponse,
)
from app.services.notification_service import (
    TIMELINE_CATEGORIES,
    NotificationServiceError,
    ResolvedNotificationRule,
    categorize_timeline_event,
    notification_service,
)
from app.services.timeline_natural_language import (
    build_delivery_natural_content,
    build_timeline_natural_content,
)

router = APIRouter(tags=["notifications"])


def _to_rule(rule: ResolvedNotificationRule) -> NotificationRuleResponse:
    return NotificationRuleResponse(
        id=str(rule.id) if rule.id is not None else None,
        tenant_id=str(rule.tenant_id),
        patient_id=str(rule.patient_id) if rule.patient_id is not None else None,
        event_category=cast(NotificationRuleCategory, rule.event_category),
        enabled=rule.enabled,
        inbox_enabled=rule.inbox_enabled,
        push_enabled=rule.push_enabled,
        realtime_enabled=rule.realtime_enabled,
        quiet_hours_start=rule.quiet_hours_start,
        quiet_hours_end=rule.quiet_hours_end,
        max_notifications_per_hour=rule.max_notifications_per_hour,
        source=cast(
            Literal["explicit", "practice_profile_default", "system_default"],
            rule.source,
        ),
        updated_at=rule.updated_at,
    )


def _to_delivery(delivery: NotificationDelivery) -> NotificationDeliveryResponse:
    natural = build_delivery_natural_content(
        category=delivery.category,
        event_type=delivery.event_type,
        status=delivery.status,
        title=delivery.title,
        body=delivery.body,
        status_reason=delivery.status_reason,
        metadata=delivery.metadata_payload,
    )
    return NotificationDeliveryResponse(
        id=str(delivery.id),
        tenant_id=str(delivery.tenant_id),
        patient_id=str(delivery.patient_id),
        event_type=delivery.event_type,
        category=cast(NotificationCategory, delivery.category),
        title=delivery.title,
        body=delivery.body,
        status=cast(NotificationDeliveryStatus, delivery.status),
        status_reason=delivery.status_reason,
        category_label=natural.category_label,
        natural_title=natural.title,
        natural_event_label=natural.event_label,
        natural_detail=natural.detail,
        channel_inbox=delivery.channel_inbox,
        channel_push=delivery.channel_push,
        channel_realtime=delivery.channel_realtime,
        metadata=delivery.metadata_payload,
        queued_at=delivery.queued_at,
        sent_at=delivery.sent_at,
        delivered_at=delivery.delivered_at,
        opened_at=delivery.opened_at,
        action_taken_at=delivery.action_taken_at,
        failed_at=delivery.failed_at,
        created_at=delivery.created_at,
        updated_at=delivery.updated_at,
    )


def _to_timeline_event(event: TimelineEvent) -> UnifiedTimelineEventResponse:
    resolved_category = cast(NotificationCategory, categorize_timeline_event(event))
    natural = build_timeline_natural_content(
        category=resolved_category,
        event_type=event.event_type,
        actor_type=event.actor_type,
        payload=event.payload,
    )
    return UnifiedTimelineEventResponse(
        id=str(event.id),
        category=resolved_category,
        event_type=event.event_type,
        category_label=natural.category_label,
        actor_type=event.actor_type,
        actor_label=natural.actor_label,
        actor_id=str(event.actor_id) if event.actor_id is not None else None,
        session_id=str(event.session_id) if event.session_id is not None else None,
        activity_id=str(event.activity_id) if event.activity_id is not None else None,
        form_id=str(event.form_id) if event.form_id is not None else None,
        notification_delivery_id=str(event.notification_delivery_id)
        if event.notification_delivery_id is not None
        else None,
        payload=event.payload,
        natural_title=natural.title,
        natural_event_label=natural.event_label,
        natural_detail=natural.detail,
        created_at=event.created_at,
    )


def _parse_categories(raw: str | None) -> set[str] | None:
    if raw is None:
        return None
    values = {item.strip() for item in raw.split(",") if item.strip()}
    if len(values) == 0:
        return None

    invalid = sorted(value for value in values if value not in TIMELINE_CATEGORIES)
    if len(invalid) > 0:
        raise HTTPException(
            status_code=422,
            detail=f"Categoria invalida para filtro de timeline: {', '.join(invalid)}.",
        )
    return values


@router.get(
    "/patients/{patient_id}/timeline-unified",
    response_model=list[UnifiedTimelineEventResponse],
)
def list_patient_unified_timeline(
    patient_id: UUID,
    categories: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[UnifiedTimelineEventResponse]:
    parsed_categories = _parse_categories(categories)
    try:
        events = notification_service.list_unified_timeline(
            db,
            tenant_id=context.tenant_id,
            patient_id=patient_id,
            categories=parsed_categories,
            limit=limit,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return [_to_timeline_event(event) for event in events]


@router.get(
    "/patients/{patient_id}/notifications",
    response_model=list[NotificationDeliveryResponse],
)
def list_patient_notifications(
    patient_id: UUID,
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[NotificationDeliveryResponse]:
    try:
        deliveries = notification_service.list_patient_deliveries(
            db,
            tenant_id=context.tenant_id,
            patient_id=patient_id,
            limit=limit,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return [_to_delivery(delivery) for delivery in deliveries]


@router.get(
    "/patients/{patient_id}/notification-preferences",
    response_model=NotificationRuleResponse,
)
def get_patient_notification_preferences(
    patient_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> NotificationRuleResponse:
    try:
        rule = notification_service.get_patient_rule(
            db,
            tenant_id=context.tenant_id,
            patient_id=patient_id,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_rule(rule)


@router.put(
    "/patients/{patient_id}/notification-preferences",
    response_model=NotificationRuleResponse,
)
def update_patient_notification_preferences(
    patient_id: UUID,
    payload: NotificationRuleUpsertRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> NotificationRuleResponse:
    try:
        notification_service.upsert_patient_rule(
            db,
            tenant_id=context.tenant_id,
            patient_id=patient_id,
            actor_user_id=context.user_id,
            event_category=payload.event_category,
            enabled=payload.enabled,
            inbox_enabled=payload.inbox_enabled,
            push_enabled=payload.push_enabled,
            realtime_enabled=payload.realtime_enabled,
            quiet_hours_start=payload.quiet_hours_start,
            quiet_hours_end=payload.quiet_hours_end,
            max_notifications_per_hour=payload.max_notifications_per_hour,
            actor_type="psychologist",
        )
        resolved = notification_service.get_patient_rule(
            db,
            tenant_id=context.tenant_id,
            patient_id=patient_id,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_rule(resolved)


@router.get(
    "/notifications/rules/tenant-default",
    response_model=NotificationRuleResponse,
)
def get_tenant_default_notification_rule(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> NotificationRuleResponse:
    return _to_rule(
        notification_service.get_tenant_default_rule(
            db,
            tenant_id=context.tenant_id,
        )
    )


@router.put(
    "/notifications/rules/tenant-default",
    response_model=NotificationRuleResponse,
)
def update_tenant_default_notification_rule(
    payload: NotificationRuleUpsertRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> NotificationRuleResponse:
    notification_service.upsert_tenant_default_rule(
        db,
        tenant_id=context.tenant_id,
        actor_user_id=context.user_id,
        event_category=payload.event_category,
        enabled=payload.enabled,
        inbox_enabled=payload.inbox_enabled,
        push_enabled=payload.push_enabled,
        realtime_enabled=payload.realtime_enabled,
        quiet_hours_start=payload.quiet_hours_start,
        quiet_hours_end=payload.quiet_hours_end,
        max_notifications_per_hour=payload.max_notifications_per_hour,
    )
    return _to_rule(
        notification_service.get_tenant_default_rule(
            db,
            tenant_id=context.tenant_id,
        )
    )


@router.post(
    "/patients/{patient_id}/documents/{document_id}/share",
    response_model=UnifiedTimelineEventResponse,
)
async def psychologist_share_document(
    patient_id: UUID,
    document_id: str,
    payload: PsychologistDocumentEventRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> UnifiedTimelineEventResponse:
    raise HTTPException(
        status_code=410,
        detail=(
            "Fluxo legado de compartilhamento de documentos foi removido. "
            "A nova versao sera reconstruida no modulo de atribuicao/aprovacao."
        ),
    )


@router.get(
    "/notification-links/{patient_access_token}/inbox",
    response_model=PatientInboxResponse,
)
def public_list_inbox(
    patient_access_token: str,
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PatientInboxResponse:
    try:
        patient, deliveries = notification_service.list_public_inbox(
            db,
            patient_access_token=patient_access_token,
            limit=limit,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return PatientInboxResponse(
        patient_id=str(patient.id),
        patient_name=patient.full_name,
        notifications=[_to_delivery(item) for item in deliveries],
    )


@router.post(
    "/notification-links/{patient_access_token}/inbox/{delivery_id}/actions",
    response_model=NotificationDeliveryResponse,
)
def public_apply_inbox_action(
    patient_access_token: str,
    delivery_id: UUID,
    payload: NotificationInboxActionRequest,
    db: Session = Depends(get_db),
) -> NotificationDeliveryResponse:
    try:
        delivery = notification_service.apply_public_inbox_action(
            db,
            patient_access_token=patient_access_token,
            delivery_id=delivery_id,
            action=payload.action,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_delivery(delivery)


@router.get(
    "/notification-links/{patient_access_token}/preferences",
    response_model=NotificationRuleResponse,
)
def public_get_notification_preferences(
    patient_access_token: str,
    db: Session = Depends(get_db),
) -> NotificationRuleResponse:
    try:
        patient, tenant_id = notification_service.resolve_public_token(
            db,
            patient_access_token=patient_access_token,
        )
        rule = notification_service.get_patient_rule(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_rule(rule)


@router.put(
    "/notification-links/{patient_access_token}/preferences",
    response_model=NotificationRuleResponse,
)
def public_update_notification_preferences(
    patient_access_token: str,
    payload: NotificationRuleUpsertRequest,
    db: Session = Depends(get_db),
) -> NotificationRuleResponse:
    try:
        patient, tenant_id = notification_service.resolve_public_token(
            db,
            patient_access_token=patient_access_token,
        )
        notification_service.upsert_patient_rule(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            actor_user_id=None,
            event_category=payload.event_category,
            enabled=payload.enabled,
            inbox_enabled=payload.inbox_enabled,
            push_enabled=payload.push_enabled,
            realtime_enabled=payload.realtime_enabled,
            quiet_hours_start=payload.quiet_hours_start,
            quiet_hours_end=payload.quiet_hours_end,
            max_notifications_per_hour=payload.max_notifications_per_hour,
            actor_type="patient",
        )
        resolved = notification_service.get_patient_rule(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
        )
    except NotificationServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_rule(resolved)


@router.post(
    "/notification-links/{patient_access_token}/documents/{document_id}/actions",
    response_model=UnifiedTimelineEventResponse,
)
def public_document_action(
    patient_access_token: str,
    document_id: str,
    payload: PatientDocumentEventRequest,
    db: Session = Depends(get_db),
) -> UnifiedTimelineEventResponse:
    raise HTTPException(
        status_code=410,
        detail=(
            "Fluxo legado de resposta de documentos foi removido. "
            "A nova versao sera reconstruida no modulo de atribuicao/aprovacao."
        ),
    )
