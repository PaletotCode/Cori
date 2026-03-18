from uuid import UUID

from sqlalchemy.orm import Session

from app.models import TimelineEvent


def append_timeline_event(
    db: Session,
    *,
    tenant_id: UUID,
    event_type: str,
    actor_type: str,
    intake_id: UUID | None = None,
    patient_id: UUID | None = None,
    session_id: UUID | None = None,
    activity_id: UUID | None = None,
    form_id: UUID | None = None,
    notification_delivery_id: UUID | None = None,
    actor_id: UUID | None = None,
    payload: dict[str, object] | None = None,
) -> TimelineEvent:
    event = TimelineEvent(
        tenant_id=tenant_id,
        intake_id=intake_id,
        patient_id=patient_id,
        session_id=session_id,
        activity_id=activity_id,
        form_id=form_id,
        notification_delivery_id=notification_delivery_id,
        event_type=event_type,
        actor_type=actor_type,
        actor_id=actor_id,
        payload=payload or {},
    )
    db.add(event)
    db.flush()
    return event
