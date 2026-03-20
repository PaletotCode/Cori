from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.activity_service import activity_service
from app.services.form_service import form_service
from app.services.notification_service import notification_service
from app.services.session_service import session_service
from app.services.template_assignment_service import template_assignment_service
from app.worker.job_queue import JobEnvelope

JOB_SESSION_REMINDERS = "scheduler.session_reminders"
JOB_ACTIVITIES_OVERDUE = "scheduler.activities_overdue"
JOB_ACTIVITIES_DISPATCH = "scheduler.activities_dispatch"
JOB_FORMS_DISPATCH = "scheduler.forms_dispatch"


def _parse_optional_tenant_id(payload: dict[str, object]) -> UUID | None:
    tenant_raw = payload.get("tenant_id")
    if tenant_raw is None:
        return None
    return UUID(str(tenant_raw))


def handle_job(*, db: Session, job: JobEnvelope) -> dict[str, object]:
    db.execute(text("SET LOCAL ROLE cori_app"))
    db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))

    payload = job.payload
    tenant_id = _parse_optional_tenant_id(payload)
    if tenant_id is not None:
        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant_id)},
        )

    if job.job_type == JOB_SESSION_REMINDERS:
        reminder_result = session_service.run_due_reminders_job(db, tenant_id=tenant_id)
        for notification in reminder_result.notifications:
            asyncio.run(
                notification_service.emit_domain_notification(
                    db,
                    tenant_id=notification.tenant_id,
                    patient_id=notification.patient_id,
                    event_type=notification.event_type,
                    title=notification.title,
                    body=notification.body,
                    metadata={"session_id": str(notification.session_id)},
                )
            )
        return {
            "processed": reminder_result.processed,
            "sent": reminder_result.sent,
            "failed": reminder_result.failed,
        }

    if job.job_type == JOB_ACTIVITIES_OVERDUE:
        overdue_result = activity_service.mark_overdue_activities(db, tenant_id=tenant_id)
        return {
            "processed": overdue_result.processed,
            "marked_overdue": overdue_result.marked_overdue,
        }

    if job.job_type == JOB_ACTIVITIES_DISPATCH:
        dispatch_result = template_assignment_service.dispatch_scheduled_activities(
            db,
            tenant_id=tenant_id,
        )
        for activity in dispatch_result.dispatched_activities:
            asyncio.run(
                notification_service.emit_domain_notification(
                    db,
                    tenant_id=activity.tenant_id,
                    patient_id=activity.patient_id,
                    event_type="activity_assigned",
                    title="Atividade agendada enviada",
                    body=f"Atividade '{activity.title}' ficou disponivel para voce.",
                    metadata={
                        "activity_id": str(activity.id),
                        "source_template_id": str(activity.source_template_id)
                        if activity.source_template_id is not None
                        else None,
                        "send_mode": "scheduled",
                    },
                )
            )
        return {
            "processed": dispatch_result.processed,
            "dispatched": dispatch_result.dispatched,
        }

    if job.job_type == JOB_FORMS_DISPATCH:
        forms_dispatch_result = form_service.dispatch_scheduled_forms(db, tenant_id=tenant_id)
        for form in forms_dispatch_result.dispatched_forms:
            asyncio.run(
                notification_service.emit_domain_notification(
                    db,
                    tenant_id=form.tenant_id,
                    patient_id=form.patient_id,
                    event_type="form_assigned",
                    title="Formulario agendado enviado",
                    body=f"Formulario '{form.title}' ficou disponivel para resposta.",
                    metadata={"form_id": str(form.id), "send_mode": "scheduled"},
                )
            )
        return {
            "processed": forms_dispatch_result.processed,
            "dispatched": forms_dispatch_result.dispatched,
        }

    raise ValueError(f"Tipo de job nao suportado: {job.job_type}")
