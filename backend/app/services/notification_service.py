import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import status
from sqlalchemy import Select, func, select, text
from sqlalchemy.orm import Session

from app.models import (
    Activity,
    ClinicalForm,
    NotificationDelivery,
    NotificationRule,
    Patient,
    PracticeProfile,
    TimelineEvent,
)
from app.models import (
    Session as ClinicalSession,
)
from app.services.realtime_hub import realtime_hub
from app.services.timeline_service import append_timeline_event

NOTIFICATION_STATUS_QUEUED = "queued"
NOTIFICATION_STATUS_SENT = "sent"
NOTIFICATION_STATUS_DELIVERED = "delivered"
NOTIFICATION_STATUS_OPENED = "opened"
NOTIFICATION_STATUS_ACTION_TAKEN = "action_taken"
NOTIFICATION_STATUS_FAILED = "failed"

CATEGORY_SESSIONS = "sessions"
CATEGORY_ACTIVITIES = "activities"
CATEGORY_FORMS = "forms"
CATEGORY_DOCUMENTS = "documents"
CATEGORY_NOTIFICATIONS = "notifications"
CATEGORY_APP_USAGE = "app_usage"
CATEGORY_ALL = "all"

TIMELINE_CATEGORIES = {
    CATEGORY_SESSIONS,
    CATEGORY_ACTIVITIES,
    CATEGORY_FORMS,
    CATEGORY_DOCUMENTS,
    CATEGORY_NOTIFICATIONS,
    CATEGORY_APP_USAGE,
}


class NotificationServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ResolvedNotificationRule:
    id: UUID | None
    tenant_id: UUID
    patient_id: UUID | None
    event_category: str
    enabled: bool
    inbox_enabled: bool
    push_enabled: bool
    realtime_enabled: bool
    quiet_hours_start: int | None
    quiet_hours_end: int | None
    max_notifications_per_hour: int
    source: str
    updated_at: datetime | None


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _set_rls_bypass(db: Session) -> None:
    db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))


def _set_current_tenant(db: Session, *, tenant_id: UUID) -> None:
    db.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant_id)},
    )


def _is_in_quiet_window(
    *,
    reference: datetime,
    quiet_hours_start: int | None,
    quiet_hours_end: int | None,
) -> bool:
    if quiet_hours_start is None or quiet_hours_end is None:
        return False

    reference_hour = reference.hour
    if quiet_hours_start == quiet_hours_end:
        return True
    if quiet_hours_start < quiet_hours_end:
        return quiet_hours_start <= reference_hour < quiet_hours_end
    return reference_hour >= quiet_hours_start or reference_hour < quiet_hours_end


def resolve_event_category(
    *,
    event_type: str,
    session_id: UUID | None = None,
    activity_id: UUID | None = None,
    form_id: UUID | None = None,
) -> str:
    if event_type.startswith("notification_"):
        return CATEGORY_NOTIFICATIONS
    if event_type.startswith("document_"):
        return CATEGORY_DOCUMENTS
    if event_type.startswith("app_"):
        return CATEGORY_APP_USAGE
    if event_type.startswith("activity_"):
        return CATEGORY_ACTIVITIES
    if event_type.startswith("form_"):
        return CATEGORY_FORMS
    if activity_id is not None:
        return CATEGORY_ACTIVITIES
    if form_id is not None:
        return CATEGORY_FORMS
    if session_id is not None or event_type.startswith("session_"):
        return CATEGORY_SESSIONS
    return CATEGORY_APP_USAGE


def resolve_entity_reference(
    *,
    event_type: str,
    metadata: dict[str, object] | None = None,
    explicit_entity_type: str | None = None,
    explicit_entity_id: str | None = None,
) -> tuple[str | None, str | None]:
    if explicit_entity_type is not None or explicit_entity_id is not None:
        return explicit_entity_type, explicit_entity_id

    payload = metadata or {}
    payload_entity_type = payload.get("entity_type")
    payload_entity_id = payload.get("entity_id")
    if isinstance(payload_entity_type, str):
        resolved_id = payload_entity_id if isinstance(payload_entity_id, str) else None
        return payload_entity_type, resolved_id

    for key, inferred_type in (
        ("activity_id", "activity"),
        ("form_id", "form"),
        ("session_id", "session"),
    ):
        value = payload.get(key)
        if isinstance(value, str):
            return inferred_type, value

    if event_type.startswith("activity_"):
        return "activity", None
    if event_type.startswith("form_"):
        return "form", None
    if event_type.startswith("session_"):
        return "session", None
    return None, None


def categorize_timeline_event(event: TimelineEvent) -> str:
    return resolve_event_category(
        event_type=event.event_type,
        session_id=event.session_id,
        activity_id=event.activity_id,
        form_id=event.form_id,
    )


def _normalize_rule_payload(
    *,
    tenant_id: UUID,
    patient_id: UUID | None,
    event_category: str,
    enabled: bool,
    inbox_enabled: bool,
    push_enabled: bool,
    realtime_enabled: bool,
    quiet_hours_start: int | None,
    quiet_hours_end: int | None,
    max_notifications_per_hour: int,
    source: str,
    updated_at: datetime | None,
    rule_id: UUID | None = None,
) -> ResolvedNotificationRule:
    return ResolvedNotificationRule(
        id=rule_id,
        tenant_id=tenant_id,
        patient_id=patient_id,
        event_category=event_category,
        enabled=enabled,
        inbox_enabled=inbox_enabled,
        push_enabled=push_enabled,
        realtime_enabled=realtime_enabled,
        quiet_hours_start=quiet_hours_start,
        quiet_hours_end=quiet_hours_end,
        max_notifications_per_hour=max_notifications_per_hour,
        source=source,
        updated_at=updated_at,
    )


class NotificationService:
    def _get_patient_for_tenant(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
    ) -> Patient:
        _set_current_tenant(db, tenant_id=tenant_id)
        patient = db.scalar(
            select(Patient).where(
                Patient.tenant_id == tenant_id,
                Patient.id == patient_id,
            )
        )
        if patient is None:
            raise NotificationServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente nao encontrado no tenant.",
            )
        return patient

    def resolve_public_token(
        self, db: Session, *, patient_access_token: str
    ) -> tuple[Patient, UUID]:
        _set_rls_bypass(db)
        token_hash = _hash_token(patient_access_token)
        now = _utcnow()

        activity = db.scalar(
            select(Activity).where(Activity.patient_access_token_hash == token_hash)
        )
        if activity is not None:
            if activity.patient_access_token_expires_at <= now:
                raise NotificationServiceError(
                    status_code=status.HTTP_410_GONE,
                    detail="Token de notificacoes expirado.",
                )
            _set_current_tenant(db, tenant_id=activity.tenant_id)
            patient = self._get_patient_for_tenant(
                db,
                tenant_id=activity.tenant_id,
                patient_id=activity.patient_id,
            )
            return patient, activity.tenant_id

        form = db.scalar(
            select(ClinicalForm).where(ClinicalForm.patient_access_token_hash == token_hash)
        )
        if form is not None:
            if form.patient_access_token_expires_at <= now:
                raise NotificationServiceError(
                    status_code=status.HTTP_410_GONE,
                    detail="Token de notificacoes expirado.",
                )
            _set_current_tenant(db, tenant_id=form.tenant_id)
            patient = self._get_patient_for_tenant(
                db,
                tenant_id=form.tenant_id,
                patient_id=form.patient_id,
            )
            return patient, form.tenant_id

        clinical_session = db.scalar(
            select(ClinicalSession).where(ClinicalSession.confirmation_token_hash == token_hash)
        )
        if clinical_session is not None:
            if clinical_session.confirmation_token_expires_at <= now:
                raise NotificationServiceError(
                    status_code=status.HTTP_410_GONE,
                    detail="Token de notificacoes expirado.",
                )
            _set_current_tenant(db, tenant_id=clinical_session.tenant_id)
            patient = self._get_patient_for_tenant(
                db,
                tenant_id=clinical_session.tenant_id,
                patient_id=clinical_session.patient_id,
            )
            return patient, clinical_session.tenant_id

        raise NotificationServiceError(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token de notificacoes invalido.",
        )

    def _resolve_effective_rule(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        event_category: str,
    ) -> ResolvedNotificationRule:
        explicit_scopes = [
            (patient_id, event_category),
            (patient_id, CATEGORY_ALL),
            (None, event_category),
            (None, CATEGORY_ALL),
        ]

        for scoped_patient_id, scoped_category in explicit_scopes:
            rule = db.scalar(
                select(NotificationRule).where(
                    NotificationRule.tenant_id == tenant_id,
                    NotificationRule.patient_id == scoped_patient_id,
                    NotificationRule.event_category == scoped_category,
                )
            )
            if rule is not None:
                return _normalize_rule_payload(
                    tenant_id=tenant_id,
                    patient_id=rule.patient_id,
                    event_category=rule.event_category,
                    enabled=bool(rule.enabled),
                    inbox_enabled=bool(rule.inbox_enabled),
                    push_enabled=bool(rule.push_enabled),
                    realtime_enabled=bool(rule.realtime_enabled),
                    quiet_hours_start=rule.quiet_hours_start,
                    quiet_hours_end=rule.quiet_hours_end,
                    max_notifications_per_hour=int(rule.max_notifications_per_hour),
                    source="explicit",
                    updated_at=rule.updated_at,
                    rule_id=rule.id,
                )

        profile = db.scalar(select(PracticeProfile).where(PracticeProfile.tenant_id == tenant_id))
        if profile is not None:
            return _normalize_rule_payload(
                tenant_id=tenant_id,
                patient_id=None,
                event_category=CATEGORY_ALL,
                enabled=True,
                inbox_enabled=True,
                push_enabled=bool(profile.notification_push_enabled),
                realtime_enabled=True,
                quiet_hours_start=None,
                quiet_hours_end=None,
                max_notifications_per_hour=20,
                source="practice_profile_default",
                updated_at=profile.updated_at,
            )

        return _normalize_rule_payload(
            tenant_id=tenant_id,
            patient_id=None,
            event_category=CATEGORY_ALL,
            enabled=True,
            inbox_enabled=True,
            push_enabled=True,
            realtime_enabled=True,
            quiet_hours_start=None,
            quiet_hours_end=None,
            max_notifications_per_hour=20,
            source="system_default",
            updated_at=None,
        )

    def get_tenant_default_rule(
        self,
        db: Session,
        *,
        tenant_id: UUID,
    ) -> ResolvedNotificationRule:
        return self._resolve_effective_rule(
            db,
            tenant_id=tenant_id,
            patient_id=UUID(int=0),
            event_category=CATEGORY_ALL,
        )

    def get_patient_rule(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
    ) -> ResolvedNotificationRule:
        self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        return self._resolve_effective_rule(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_category=CATEGORY_ALL,
        )

    def _upsert_rule(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID | None,
        actor_user_id: UUID | None,
        event_category: str,
        enabled: bool,
        inbox_enabled: bool,
        push_enabled: bool,
        realtime_enabled: bool,
        quiet_hours_start: int | None,
        quiet_hours_end: int | None,
        max_notifications_per_hour: int,
    ) -> NotificationRule:
        rule = db.scalar(
            select(NotificationRule).where(
                NotificationRule.tenant_id == tenant_id,
                NotificationRule.patient_id == patient_id,
                NotificationRule.event_category == event_category,
            )
        )

        if rule is None:
            rule = NotificationRule(
                tenant_id=tenant_id,
                patient_id=patient_id,
                event_category=event_category,
                created_by_user_id=actor_user_id,
                updated_by_user_id=actor_user_id,
                enabled=enabled,
                inbox_enabled=inbox_enabled,
                push_enabled=push_enabled,
                realtime_enabled=realtime_enabled,
                quiet_hours_start=quiet_hours_start,
                quiet_hours_end=quiet_hours_end,
                max_notifications_per_hour=max_notifications_per_hour,
            )
            db.add(rule)
            db.flush()
            return rule

        rule.updated_by_user_id = actor_user_id
        rule.enabled = enabled
        rule.inbox_enabled = inbox_enabled
        rule.push_enabled = push_enabled
        rule.realtime_enabled = realtime_enabled
        rule.quiet_hours_start = quiet_hours_start
        rule.quiet_hours_end = quiet_hours_end
        rule.max_notifications_per_hour = max_notifications_per_hour
        db.flush()
        return rule

    def upsert_tenant_default_rule(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        event_category: str,
        enabled: bool,
        inbox_enabled: bool,
        push_enabled: bool,
        realtime_enabled: bool,
        quiet_hours_start: int | None,
        quiet_hours_end: int | None,
        max_notifications_per_hour: int,
    ) -> NotificationRule:
        return self._upsert_rule(
            db,
            tenant_id=tenant_id,
            patient_id=None,
            actor_user_id=actor_user_id,
            event_category=event_category,
            enabled=enabled,
            inbox_enabled=inbox_enabled,
            push_enabled=push_enabled,
            realtime_enabled=realtime_enabled,
            quiet_hours_start=quiet_hours_start,
            quiet_hours_end=quiet_hours_end,
            max_notifications_per_hour=max_notifications_per_hour,
        )

    def upsert_patient_rule(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        actor_user_id: UUID | None,
        event_category: str,
        enabled: bool,
        inbox_enabled: bool,
        push_enabled: bool,
        realtime_enabled: bool,
        quiet_hours_start: int | None,
        quiet_hours_end: int | None,
        max_notifications_per_hour: int,
        actor_type: str,
    ) -> NotificationRule:
        patient = self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        rule = self._upsert_rule(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            actor_user_id=actor_user_id,
            event_category=event_category,
            enabled=enabled,
            inbox_enabled=inbox_enabled,
            push_enabled=push_enabled,
            realtime_enabled=realtime_enabled,
            quiet_hours_start=quiet_hours_start,
            quiet_hours_end=quiet_hours_end,
            max_notifications_per_hour=max_notifications_per_hour,
        )
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            actor_type=actor_type,
            actor_id=actor_user_id,
            event_type="notification_preferences_updated",
            payload={
                "event_category": rule.event_category,
                "enabled": bool(rule.enabled),
                "inbox_enabled": bool(rule.inbox_enabled),
                "push_enabled": bool(rule.push_enabled),
                "realtime_enabled": bool(rule.realtime_enabled),
                "quiet_hours_start": rule.quiet_hours_start,
                "quiet_hours_end": rule.quiet_hours_end,
                "max_notifications_per_hour": int(rule.max_notifications_per_hour),
            },
        )
        return rule

    def _count_recent_deliveries(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        reference: datetime,
    ) -> int:
        since = reference - timedelta(hours=1)
        count_query = select(func.count(NotificationDelivery.id)).where(
            NotificationDelivery.tenant_id == tenant_id,
            NotificationDelivery.patient_id == patient_id,
            NotificationDelivery.created_at >= since,
            NotificationDelivery.status != NOTIFICATION_STATUS_FAILED,
        )
        return int(db.scalar(count_query) or 0)

    def _append_tracking_event(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        event_type: str,
        delivery: NotificationDelivery,
        actor_type: str,
        payload: dict[str, object] | None = None,
        actor_id: UUID | None = None,
    ) -> None:
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            actor_type=actor_type,
            actor_id=actor_id,
            event_type=event_type,
            notification_delivery_id=delivery.id,
            payload={
                "notification_id": str(delivery.id),
                "delivery_status": delivery.status,
                "category": delivery.category,
                **(payload or {}),
            },
        )

    def _mark_failed(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        delivery: NotificationDelivery,
        reason: str,
    ) -> NotificationDelivery:
        now = _utcnow()
        delivery.status = NOTIFICATION_STATUS_FAILED
        delivery.status_reason = reason
        delivery.failed_at = now
        db.flush()
        self._append_tracking_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="notification_failed",
            delivery=delivery,
            actor_type="system",
            payload={"reason": reason},
        )
        return delivery

    async def emit_domain_notification(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        event_type: str,
        title: str,
        body: str,
        metadata: dict[str, object] | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
    ) -> NotificationDelivery:
        self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        now = _utcnow()
        category = resolve_event_category(event_type=event_type)
        resolved_entity_type, resolved_entity_id = resolve_entity_reference(
            event_type=event_type,
            metadata=metadata,
            explicit_entity_type=entity_type,
            explicit_entity_id=entity_id,
        )
        metadata_payload = dict(metadata or {})
        if resolved_entity_type is not None and "entity_type" not in metadata_payload:
            metadata_payload["entity_type"] = resolved_entity_type
        if resolved_entity_id is not None and "entity_id" not in metadata_payload:
            metadata_payload["entity_id"] = resolved_entity_id

        rule = self._resolve_effective_rule(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_category=category,
        )

        delivery = NotificationDelivery(
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type=event_type,
            category=category,
            title=title,
            body=body,
            status=NOTIFICATION_STATUS_QUEUED,
            status_reason=None,
            channel_inbox=rule.inbox_enabled,
            channel_push=rule.push_enabled,
            channel_realtime=rule.realtime_enabled,
            metadata_payload=metadata_payload,
            queued_at=now,
        )
        db.add(delivery)
        db.flush()

        self._append_tracking_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="notification_queued",
            delivery=delivery,
            actor_type="system",
            payload={"trigger_event_type": event_type},
        )

        if not rule.enabled:
            return self._mark_failed(
                db,
                tenant_id=tenant_id,
                patient_id=patient_id,
                delivery=delivery,
                reason="Regra de notificacao desabilitada para o paciente.",
            )

        if not (rule.inbox_enabled or rule.push_enabled or rule.realtime_enabled):
            return self._mark_failed(
                db,
                tenant_id=tenant_id,
                patient_id=patient_id,
                delivery=delivery,
                reason="Nenhum canal habilitado para notificacao.",
            )

        if _is_in_quiet_window(
            reference=now,
            quiet_hours_start=rule.quiet_hours_start,
            quiet_hours_end=rule.quiet_hours_end,
        ):
            return self._mark_failed(
                db,
                tenant_id=tenant_id,
                patient_id=patient_id,
                delivery=delivery,
                reason="Dentro da janela de silencio configurada.",
            )

        if (
            self._count_recent_deliveries(
                db,
                tenant_id=tenant_id,
                patient_id=patient_id,
                reference=now,
            )
            > rule.max_notifications_per_hour
        ):
            return self._mark_failed(
                db,
                tenant_id=tenant_id,
                patient_id=patient_id,
                delivery=delivery,
                reason="Frequencia maxima de notificacoes por hora atingida.",
            )

        delivery.status = NOTIFICATION_STATUS_SENT
        delivery.sent_at = _utcnow()
        db.flush()
        self._append_tracking_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="notification_sent",
            delivery=delivery,
            actor_type="system",
        )

        if delivery.channel_realtime:
            await realtime_hub.broadcast_notification(
                tenant_id=tenant_id,
                title=title,
                body=body,
                notification_id=delivery.id,
                patient_id=patient_id,
                status=delivery.status,
                category=delivery.category,
                event_type=event_type,
                entity_type=resolved_entity_type,
                entity_id=resolved_entity_id,
                metadata=metadata_payload,
                created_at=delivery.created_at,
            )

        delivery.status = NOTIFICATION_STATUS_DELIVERED
        delivery.delivered_at = _utcnow()
        db.flush()
        self._append_tracking_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="notification_delivered",
            delivery=delivery,
            actor_type="system",
        )
        return delivery

    def list_patient_deliveries(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        limit: int = 200,
    ) -> list[NotificationDelivery]:
        self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        query: Select[tuple[NotificationDelivery]] = select(NotificationDelivery).where(
            NotificationDelivery.tenant_id == tenant_id,
            NotificationDelivery.patient_id == patient_id,
        )
        query = query.order_by(NotificationDelivery.created_at.desc()).limit(
            max(1, min(limit, 500))
        )
        return list(db.scalars(query).all())

    def list_unified_timeline(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        categories: set[str] | None,
        limit: int = 200,
    ) -> list[TimelineEvent]:
        self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        safe_limit = max(1, min(limit, 500))
        query_limit = safe_limit if not categories else min(500, safe_limit * 4)

        query: Select[tuple[TimelineEvent]] = select(TimelineEvent).where(
            TimelineEvent.tenant_id == tenant_id,
            TimelineEvent.patient_id == patient_id,
        )
        query = query.order_by(TimelineEvent.created_at.desc()).limit(query_limit)
        events = list(db.scalars(query).all())

        if not categories:
            return events[:safe_limit]

        filtered = [event for event in events if categorize_timeline_event(event) in categories]
        return filtered[:safe_limit]

    def list_public_inbox(
        self,
        db: Session,
        *,
        patient_access_token: str,
        limit: int = 200,
    ) -> tuple[Patient, list[NotificationDelivery]]:
        patient, tenant_id = self.resolve_public_token(
            db, patient_access_token=patient_access_token
        )
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            actor_type="patient",
            event_type="app_opened",
            payload={"surface": "notifications_inbox"},
        )

        query: Select[tuple[NotificationDelivery]] = select(NotificationDelivery).where(
            NotificationDelivery.tenant_id == tenant_id,
            NotificationDelivery.patient_id == patient.id,
            NotificationDelivery.channel_inbox.is_(True),
        )
        query = query.order_by(NotificationDelivery.created_at.desc()).limit(
            max(1, min(limit, 500))
        )
        deliveries = list(db.scalars(query).all())
        return patient, deliveries

    def apply_public_inbox_action(
        self,
        db: Session,
        *,
        patient_access_token: str,
        delivery_id: UUID,
        action: str,
    ) -> NotificationDelivery:
        patient, tenant_id = self.resolve_public_token(
            db, patient_access_token=patient_access_token
        )
        delivery = db.scalar(
            select(NotificationDelivery).where(
                NotificationDelivery.id == delivery_id,
                NotificationDelivery.tenant_id == tenant_id,
                NotificationDelivery.patient_id == patient.id,
            )
        )
        if delivery is None:
            raise NotificationServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notificacao nao encontrada para o paciente.",
            )

        now = _utcnow()
        if action == "open":
            if delivery.opened_at is None:
                delivery.opened_at = now
            if delivery.status != NOTIFICATION_STATUS_ACTION_TAKEN:
                delivery.status = NOTIFICATION_STATUS_OPENED
            db.flush()
            self._append_tracking_event(
                db,
                tenant_id=tenant_id,
                patient_id=patient.id,
                event_type="notification_opened",
                delivery=delivery,
                actor_type="patient",
            )
            return delivery

        if delivery.opened_at is None:
            delivery.opened_at = now
        delivery.status = NOTIFICATION_STATUS_ACTION_TAKEN
        delivery.action_taken_at = now
        db.flush()
        self._append_tracking_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            event_type="notification_action_taken",
            delivery=delivery,
            actor_type="patient",
        )
        return delivery

    def record_psychologist_document_event(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        actor_user_id: UUID,
        document_id: str,
        document_title: str,
        note: str | None,
    ) -> TimelineEvent:
        patient = self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        return append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type="document_shared",
            payload={
                "document_id": document_id,
                "document_title": document_title,
                "note": note,
            },
        )

    def record_public_document_event(
        self,
        db: Session,
        *,
        patient_access_token: str,
        document_id: str,
        action: str,
        note: str | None,
    ) -> TimelineEvent:
        patient, tenant_id = self.resolve_public_token(
            db, patient_access_token=patient_access_token
        )
        if action not in {"opened", "acknowledged"}:
            raise NotificationServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Acao de documento invalida.",
            )
        return append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            actor_type="patient",
            event_type=f"document_{action}",
            payload={
                "document_id": document_id,
                "note": note,
            },
        )


notification_service = NotificationService()
