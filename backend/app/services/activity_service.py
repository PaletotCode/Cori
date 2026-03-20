import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy import Select, select, text
from sqlalchemy.orm import Session

from app.models import Activity, Patient, Psychologist, TimelineEvent
from app.schemas.activity import (
    ActivityCreateRequest,
    ActivityPatientActionRequest,
    ActivityPsychologistActionRequest,
    ActivityRecurrenceRule,
    ActivityUpdateRequest,
)
from app.services.timeline_service import append_timeline_event

ACTIVITY_STATUS_SCHEDULED = "scheduled"
ACTIVITY_STATUS_ASSIGNED = "assigned"
ACTIVITY_STATUS_OPENED = "opened"
ACTIVITY_STATUS_IN_PROGRESS = "in_progress"
ACTIVITY_STATUS_PAUSED = "paused"
ACTIVITY_STATUS_COMPLETED = "completed"
ACTIVITY_STATUS_CANCELED = "canceled"
ACTIVITY_STATUS_OVERDUE = "overdue"

ACTIVE_ACTIVITY_STATUSES = {
    ACTIVITY_STATUS_ASSIGNED,
    ACTIVITY_STATUS_OPENED,
    ACTIVITY_STATUS_IN_PROGRESS,
    ACTIVITY_STATUS_PAUSED,
}


class ActivityServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ActivityCreationResult:
    activity: Activity
    patient_access_token: str
    patient_access_link: str


@dataclass(frozen=True)
class PatientActivityActionResult:
    activity: Activity
    recurring_assignment: ActivityCreationResult | None


@dataclass(frozen=True)
class ActivityOverdueRunResult:
    processed: int
    marked_overdue: int


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


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _normalize_due_at(due_at: datetime) -> datetime:
    if due_at.tzinfo is None:
        raise ActivityServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Prazo da atividade deve incluir timezone.",
        )
    return due_at


def _normalize_recurrence(
    *,
    recurrence_rule: ActivityRecurrenceRule,
    recurrence_interval: int,
    recurrence_end_at: datetime | None,
    due_at: datetime,
) -> tuple[ActivityRecurrenceRule, int, datetime | None]:
    if recurrence_rule == "none":
        return "none", 1, None

    normalized_end_at = recurrence_end_at
    if normalized_end_at is not None:
        if normalized_end_at.tzinfo is None:
            raise ActivityServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Fim da recorrencia deve incluir timezone.",
            )
        if normalized_end_at <= due_at:
            raise ActivityServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Fim da recorrencia deve ser maior que o prazo inicial.",
            )
    return recurrence_rule, recurrence_interval, normalized_end_at


def _build_patient_access_link(base_url: str, token: str) -> str:
    return f"{base_url.rstrip('/')}?token={token}"


def _resolve_elapsed_seconds(activity: Activity, *, reference: datetime | None = None) -> int:
    resolved = max(0, int(activity.execution_elapsed_seconds))
    if activity.last_started_at is None:
        return resolved

    now = reference or _utcnow()
    delta_seconds = int((now - activity.last_started_at).total_seconds())
    if delta_seconds <= 0:
        return resolved
    return resolved + delta_seconds


def _accumulate_running_elapsed(activity: Activity, *, reference: datetime | None = None) -> int:
    resolved = _resolve_elapsed_seconds(activity, reference=reference)
    activity.execution_elapsed_seconds = resolved
    activity.last_started_at = None
    return resolved


def _next_due_at(activity: Activity) -> datetime:
    if activity.recurrence_rule == "daily":
        return activity.due_at + timedelta(days=activity.recurrence_interval)
    return activity.due_at + timedelta(weeks=activity.recurrence_interval)


def _build_token_window(*, due_at: datetime, now: datetime | None = None) -> tuple[str, datetime]:
    reference = now or _utcnow()
    expires_at = max(reference + timedelta(days=30), due_at + timedelta(days=180))
    token = secrets.token_urlsafe(32)
    return token, expires_at


class ActivityService:
    def get_psychologist_for_user(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
    ) -> Psychologist:
        psychologist = db.scalar(
            select(Psychologist).where(
                Psychologist.tenant_id == tenant_id,
                Psychologist.user_id == user_id,
            )
        )
        if psychologist is None:
            raise ActivityServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Psicologo nao encontrado para o usuario autenticado.",
            )
        return psychologist

    def _get_patient_for_tenant(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
    ) -> Patient:
        patient = db.scalar(
            select(Patient).where(
                Patient.tenant_id == tenant_id,
                Patient.id == patient_id,
                Patient.archived_at.is_(None),
            )
        )
        if patient is None:
            raise ActivityServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente nao encontrado para atribuicao da atividade.",
            )
        return patient

    def get_activity_for_tenant(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        activity_id: UUID,
    ) -> Activity | None:
        return db.scalar(
            select(Activity).where(
                Activity.tenant_id == tenant_id,
                Activity.id == activity_id,
            )
        )

    def _create_activity_row(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        psychologist_id: UUID,
        actor_user_id: UUID | None,
        source_activity_id: UUID | None,
        activity_type: str,
        title: str,
        description: str | None,
        instructions: str | None,
        document_url: str | None,
        configuration: dict[str, object],
        due_at: datetime,
        recurrence_rule: ActivityRecurrenceRule,
        recurrence_interval: int,
        recurrence_end_at: datetime | None,
        patient_activities_base_url: str,
        event_payload: dict[str, object],
        actor_type: str,
    ) -> ActivityCreationResult:
        now = _utcnow()
        token, token_expires_at = _build_token_window(due_at=due_at, now=now)

        activity = Activity(
            tenant_id=tenant_id,
            patient_id=patient_id,
            psychologist_id=psychologist_id,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
            source_activity_id=source_activity_id,
            activity_type=activity_type,
            title=title,
            description=description,
            instructions=instructions,
            document_url=document_url,
            configuration=configuration,
            status=ACTIVITY_STATUS_ASSIGNED,
            due_at=due_at,
            assigned_at=now,
            recurrence_rule=recurrence_rule,
            recurrence_interval=recurrence_interval,
            recurrence_end_at=recurrence_end_at,
            execution_elapsed_seconds=0,
            patient_access_token_hash=_hash_token(token),
            patient_access_token_expires_at=token_expires_at,
        )
        db.add(activity)
        db.flush()

        access_link = _build_patient_access_link(patient_activities_base_url, token)
        payload = {
            **event_payload,
            "activity_id": str(activity.id),
            "activity_type": activity.activity_type,
            "title": activity.title,
            "due_at": activity.due_at.isoformat(),
            "recurrence_rule": activity.recurrence_rule,
            "recurrence_interval": activity.recurrence_interval,
            "patient_access_link": access_link,
        }
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
            activity_id=activity.id,
            actor_type=actor_type,
            actor_id=actor_user_id,
            event_type="assigned",
            payload=payload,
        )
        return ActivityCreationResult(
            activity=activity,
            patient_access_token=token,
            patient_access_link=access_link,
        )

    def create_activity(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        payload: ActivityCreateRequest,
        patient_activities_base_url: str,
    ) -> ActivityCreationResult:
        try:
            patient_uuid = UUID(payload.patient_id)
        except ValueError as exc:
            raise ActivityServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="patient_id invalido.",
            ) from exc

        due_at = _normalize_due_at(payload.due_at)
        recurrence_rule, recurrence_interval, recurrence_end_at = _normalize_recurrence(
            recurrence_rule=payload.recurrence_rule,
            recurrence_interval=payload.recurrence_interval,
            recurrence_end_at=payload.recurrence_end_at,
            due_at=due_at,
        )

        if (
            payload.activity_type == "document_reading"
            and _clean_optional(payload.document_url) is None
        ):
            raise ActivityServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Atividade de leitura/documento exige document_url.",
            )

        patient = self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_uuid)
        psychologist = self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )
        return self._create_activity_row(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            psychologist_id=psychologist.id,
            actor_user_id=actor_user_id,
            source_activity_id=None,
            activity_type=payload.activity_type,
            title=payload.title.strip(),
            description=_clean_optional(payload.description),
            instructions=_clean_optional(payload.instructions),
            document_url=_clean_optional(payload.document_url),
            configuration=payload.configuration or {},
            due_at=due_at,
            recurrence_rule=recurrence_rule,
            recurrence_interval=recurrence_interval,
            recurrence_end_at=recurrence_end_at,
            patient_activities_base_url=patient_activities_base_url,
            event_payload={
                "origin": "manual_create",
            },
            actor_type="psychologist",
        )

    def list_activities(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID | None = None,
        status_filter: str | None = None,
        limit: int = 200,
    ) -> list[Activity]:
        self.mark_overdue_activities(db, tenant_id=tenant_id)

        query: Select[tuple[Activity]] = select(Activity).where(Activity.tenant_id == tenant_id)
        if patient_id is not None:
            query = query.where(Activity.patient_id == patient_id)
        if status_filter is not None:
            query = query.where(Activity.status == status_filter)
        query = query.order_by(Activity.created_at.desc()).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())

    def update_activity(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        activity_id: UUID,
        payload: ActivityUpdateRequest,
    ) -> Activity:
        activity = self.get_activity_for_tenant(db, tenant_id=tenant_id, activity_id=activity_id)
        if activity is None:
            raise ActivityServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Atividade nao encontrada.",
            )
        if activity.status in {ACTIVITY_STATUS_CANCELED, ACTIVITY_STATUS_COMPLETED}:
            raise ActivityServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Atividade encerrada nao pode ser editada. Reabra antes de editar.",
            )

        previous_data = {
            "activity_type": activity.activity_type,
            "title": activity.title,
            "description": activity.description,
            "instructions": activity.instructions,
            "document_url": activity.document_url,
            "due_at": activity.due_at.isoformat(),
            "recurrence_rule": activity.recurrence_rule,
            "recurrence_interval": activity.recurrence_interval,
            "recurrence_end_at": activity.recurrence_end_at.isoformat()
            if activity.recurrence_end_at is not None
            else None,
            "configuration": activity.configuration,
        }

        if payload.activity_type is not None:
            activity.activity_type = payload.activity_type
        if payload.title is not None:
            activity.title = payload.title.strip()
        if payload.description is not None:
            activity.description = _clean_optional(payload.description)
        if payload.instructions is not None:
            activity.instructions = _clean_optional(payload.instructions)
        if payload.document_url is not None:
            activity.document_url = _clean_optional(payload.document_url)
        if payload.configuration is not None:
            activity.configuration = payload.configuration
        if payload.due_at is not None:
            activity.due_at = _normalize_due_at(payload.due_at)
        if payload.recurrence_rule is not None:
            activity.recurrence_rule = payload.recurrence_rule
        if payload.recurrence_interval is not None:
            activity.recurrence_interval = payload.recurrence_interval
        if payload.recurrence_end_at is not None:
            if payload.recurrence_end_at.tzinfo is None:
                raise ActivityServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Fim da recorrencia deve incluir timezone.",
                )
            activity.recurrence_end_at = payload.recurrence_end_at
        elif payload.recurrence_rule == "none":
            activity.recurrence_end_at = None

        recurrence_rule, recurrence_interval, recurrence_end_at = _normalize_recurrence(
            recurrence_rule=cast(ActivityRecurrenceRule, activity.recurrence_rule),
            recurrence_interval=activity.recurrence_interval,
            recurrence_end_at=activity.recurrence_end_at,
            due_at=activity.due_at,
        )
        activity.recurrence_rule = recurrence_rule
        activity.recurrence_interval = recurrence_interval
        activity.recurrence_end_at = recurrence_end_at
        activity.updated_by_user_id = actor_user_id

        if (
            activity.activity_type == "document_reading"
            and _clean_optional(activity.document_url) is None
        ):
            raise ActivityServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Atividade de leitura/documento exige document_url.",
            )

        current_data = {
            "activity_type": activity.activity_type,
            "title": activity.title,
            "description": activity.description,
            "instructions": activity.instructions,
            "document_url": activity.document_url,
            "due_at": activity.due_at.isoformat(),
            "recurrence_rule": activity.recurrence_rule,
            "recurrence_interval": activity.recurrence_interval,
            "recurrence_end_at": activity.recurrence_end_at.isoformat()
            if activity.recurrence_end_at is not None
            else None,
            "configuration": activity.configuration,
        }
        changed_fields = sorted(
            key for key in current_data.keys() if previous_data.get(key) != current_data.get(key)
        )
        if len(changed_fields) > 0:
            append_timeline_event(
                db,
                tenant_id=tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="psychologist",
                actor_id=actor_user_id,
                event_type="updated",
                payload={
                    "changed_fields": changed_fields,
                    "previous": previous_data,
                    "current": current_data,
                },
            )
        return activity

    def apply_psychologist_action(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        activity_id: UUID,
        payload: ActivityPsychologistActionRequest,
    ) -> Activity:
        activity = self.get_activity_for_tenant(db, tenant_id=tenant_id, activity_id=activity_id)
        if activity is None:
            raise ActivityServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Atividade nao encontrada.",
            )

        reason = _clean_optional(payload.reason)
        now = _utcnow()

        if payload.action == "resend":
            if activity.status == ACTIVITY_STATUS_CANCELED:
                raise ActivityServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atividade cancelada nao pode ser reenviada.",
                )
            activity.last_resent_at = now
            activity.updated_by_user_id = actor_user_id
            append_timeline_event(
                db,
                tenant_id=tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="psychologist",
                actor_id=actor_user_id,
                event_type="assigned",
                payload={
                    "resent": True,
                    "reason": reason,
                    "due_at": activity.due_at.isoformat(),
                },
            )
            return activity

        if payload.action == "cancel":
            if activity.status == ACTIVITY_STATUS_CANCELED:
                raise ActivityServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atividade ja esta cancelada.",
                )
            elapsed = _accumulate_running_elapsed(activity, reference=now)
            activity.status = ACTIVITY_STATUS_CANCELED
            activity.canceled_at = now
            activity.updated_by_user_id = actor_user_id
            append_timeline_event(
                db,
                tenant_id=tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="psychologist",
                actor_id=actor_user_id,
                event_type="canceled",
                payload={"reason": reason, "execution_elapsed_seconds": elapsed},
            )
            return activity

        if activity.status not in {
            ACTIVITY_STATUS_COMPLETED,
            ACTIVITY_STATUS_CANCELED,
            ACTIVITY_STATUS_OVERDUE,
        }:
            raise ActivityServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Atividade so pode ser reaberta quando encerrada ou atrasada.",
            )

        from_status = activity.status
        activity.status = ACTIVITY_STATUS_ASSIGNED
        activity.assigned_at = now
        activity.opened_at = None
        activity.started_at = None
        activity.paused_at = None
        activity.completed_at = None
        activity.canceled_at = None
        activity.overdue_at = None
        activity.execution_elapsed_seconds = 0
        activity.last_started_at = None
        activity.feedback_note = None
        activity.updated_by_user_id = actor_user_id
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=activity.patient_id,
            activity_id=activity.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type="reopened",
            payload={"from_status": from_status, "reason": reason},
        )
        return activity

    def list_activity_timeline_events(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        activity_id: UUID,
        limit: int = 200,
    ) -> list[TimelineEvent]:
        query: Select[tuple[TimelineEvent]] = select(TimelineEvent).where(
            TimelineEvent.tenant_id == tenant_id,
            TimelineEvent.activity_id == activity_id,
        )
        query = query.order_by(TimelineEvent.created_at.desc()).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())

    def mark_overdue_activities(
        self,
        db: Session,
        *,
        tenant_id: UUID | None = None,
        now: datetime | None = None,
    ) -> ActivityOverdueRunResult:
        reference = now or _utcnow()
        query: Select[tuple[Activity]] = select(Activity).where(
            Activity.status.in_(ACTIVE_ACTIVITY_STATUSES),
            Activity.due_at < reference,
            Activity.overdue_at.is_(None),
        )
        if tenant_id is not None:
            query = query.where(Activity.tenant_id == tenant_id)

        overdue_candidates = list(db.scalars(query).all())
        marked = 0
        for activity in overdue_candidates:
            elapsed = _resolve_elapsed_seconds(activity, reference=reference)
            activity.status = ACTIVITY_STATUS_OVERDUE
            activity.overdue_at = reference
            append_timeline_event(
                db,
                tenant_id=activity.tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="system",
                event_type="overdue",
                payload={
                    "due_at": activity.due_at.isoformat(),
                    "marked_at": reference.isoformat(),
                    "execution_elapsed_seconds": elapsed,
                },
            )
            marked += 1

        return ActivityOverdueRunResult(
            processed=len(overdue_candidates),
            marked_overdue=marked,
        )

    def _get_public_anchor_activity_by_token(
        self,
        db: Session,
        *,
        patient_access_token: str,
    ) -> Activity:
        _set_rls_bypass(db)
        anchor = db.scalar(
            select(Activity).where(
                Activity.patient_access_token_hash == _hash_token(patient_access_token)
            )
        )
        if anchor is None:
            raise ActivityServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Link de atividades invalido.",
            )
        if anchor.patient_access_token_expires_at <= _utcnow():
            raise ActivityServiceError(
                status_code=status.HTTP_410_GONE,
                detail="Link de atividades expirado.",
            )
        _set_current_tenant(db, tenant_id=anchor.tenant_id)
        return anchor

    def list_public_activities_by_token(
        self,
        db: Session,
        *,
        patient_access_token: str,
    ) -> tuple[Patient, list[Activity]]:
        anchor = self._get_public_anchor_activity_by_token(
            db,
            patient_access_token=patient_access_token,
        )
        self.mark_overdue_activities(db, tenant_id=anchor.tenant_id)

        patient = db.scalar(
            select(Patient).where(
                Patient.id == anchor.patient_id,
                Patient.tenant_id == anchor.tenant_id,
            )
        )
        if patient is None:
            raise ActivityServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente associado ao link nao encontrado.",
            )

        activities = list(
            db.scalars(
                select(Activity).where(
                    Activity.tenant_id == anchor.tenant_id,
                    Activity.patient_id == anchor.patient_id,
                    Activity.status.notin_(
                        [ACTIVITY_STATUS_CANCELED, ACTIVITY_STATUS_SCHEDULED]
                    ),
                ).order_by(Activity.due_at.asc(), Activity.created_at.desc())
            ).all()
        )
        return patient, activities

    def _spawn_recurring_assignment(
        self,
        db: Session,
        *,
        source_activity: Activity,
        actor_type: str,
        patient_activities_base_url: str,
    ) -> ActivityCreationResult | None:
        if source_activity.recurrence_rule == "none":
            return None

        next_due_at = _next_due_at(source_activity)
        if (
            source_activity.recurrence_end_at is not None
            and next_due_at > source_activity.recurrence_end_at
        ):
            return None

        source_id = source_activity.source_activity_id or source_activity.id
        return self._create_activity_row(
            db,
            tenant_id=source_activity.tenant_id,
            patient_id=source_activity.patient_id,
            psychologist_id=source_activity.psychologist_id,
            actor_user_id=source_activity.updated_by_user_id,
            source_activity_id=source_id,
            activity_type=source_activity.activity_type,
            title=source_activity.title,
            description=source_activity.description,
            instructions=source_activity.instructions,
            document_url=source_activity.document_url,
            configuration=source_activity.configuration,
            due_at=next_due_at,
            recurrence_rule=cast(ActivityRecurrenceRule, source_activity.recurrence_rule),
            recurrence_interval=source_activity.recurrence_interval,
            recurrence_end_at=source_activity.recurrence_end_at,
            patient_activities_base_url=patient_activities_base_url,
            event_payload={
                "origin": "recurrence",
                "source_activity_id": str(source_activity.id),
            },
            actor_type=actor_type,
        )

    def apply_public_action(
        self,
        db: Session,
        *,
        patient_access_token: str,
        activity_id: UUID,
        payload: ActivityPatientActionRequest,
        patient_activities_base_url: str,
    ) -> PatientActivityActionResult:
        anchor = self._get_public_anchor_activity_by_token(
            db,
            patient_access_token=patient_access_token,
        )
        self.mark_overdue_activities(db, tenant_id=anchor.tenant_id)

        activity = db.scalar(
            select(Activity).where(
                Activity.id == activity_id,
                Activity.tenant_id == anchor.tenant_id,
                Activity.patient_id == anchor.patient_id,
            )
        )
        if activity is None:
            raise ActivityServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Atividade nao encontrada para este paciente.",
            )

        now = _utcnow()
        recurring_assignment: ActivityCreationResult | None = None

        if payload.action == "open":
            if activity.status in {ACTIVITY_STATUS_CANCELED, ACTIVITY_STATUS_COMPLETED}:
                raise ActivityServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atividade encerrada nao pode ser aberta.",
                )
            if activity.opened_at is None:
                activity.opened_at = now
            if activity.status == ACTIVITY_STATUS_ASSIGNED:
                activity.status = ACTIVITY_STATUS_OPENED
            append_timeline_event(
                db,
                tenant_id=activity.tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="patient",
                event_type="opened",
                payload={
                    "status_snapshot": activity.status,
                    "due_at": activity.due_at.isoformat(),
                },
            )
            return PatientActivityActionResult(
                activity=activity,
                recurring_assignment=None,
            )

        if payload.action == "start":
            if activity.status in {ACTIVITY_STATUS_CANCELED, ACTIVITY_STATUS_COMPLETED}:
                raise ActivityServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atividade encerrada nao pode ser iniciada.",
                )
            if activity.status == ACTIVITY_STATUS_IN_PROGRESS:
                raise ActivityServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atividade ja esta em execucao.",
                )
            resumed = activity.status == ACTIVITY_STATUS_PAUSED
            activity.status = ACTIVITY_STATUS_IN_PROGRESS
            if activity.started_at is None:
                activity.started_at = now
            activity.last_started_at = now
            append_timeline_event(
                db,
                tenant_id=activity.tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="patient",
                event_type="resumed" if resumed else "started",
                payload={
                    "execution_elapsed_seconds": activity.execution_elapsed_seconds,
                },
            )
            return PatientActivityActionResult(
                activity=activity,
                recurring_assignment=None,
            )

        if payload.action == "pause":
            if activity.status != ACTIVITY_STATUS_IN_PROGRESS:
                raise ActivityServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atividade so pode ser pausada quando em execucao.",
                )
            elapsed = _accumulate_running_elapsed(activity, reference=now)
            activity.status = ACTIVITY_STATUS_PAUSED
            activity.paused_at = now
            append_timeline_event(
                db,
                tenant_id=activity.tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="patient",
                event_type="paused",
                payload={"execution_elapsed_seconds": elapsed},
            )
            return PatientActivityActionResult(
                activity=activity,
                recurring_assignment=None,
            )

        if activity.status in {ACTIVITY_STATUS_CANCELED, ACTIVITY_STATUS_COMPLETED}:
            raise ActivityServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Atividade encerrada nao pode ser concluida novamente.",
            )
        if activity.last_started_at is not None:
            _accumulate_running_elapsed(activity, reference=now)
        activity.status = ACTIVITY_STATUS_COMPLETED
        activity.completed_at = now
        feedback_note = _clean_optional(payload.feedback_note)
        if feedback_note is not None:
            activity.feedback_note = feedback_note
        append_timeline_event(
            db,
            tenant_id=activity.tenant_id,
            patient_id=activity.patient_id,
            activity_id=activity.id,
            actor_type="patient",
            event_type="completed",
            payload={
                "execution_elapsed_seconds": activity.execution_elapsed_seconds,
                "feedback_note": feedback_note,
            },
        )

        recurring_assignment = self._spawn_recurring_assignment(
            db,
            source_activity=activity,
            actor_type="system",
            patient_activities_base_url=patient_activities_base_url,
        )
        return PatientActivityActionResult(
            activity=activity,
            recurring_assignment=recurring_assignment,
        )


activity_service = ActivityService()
