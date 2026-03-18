import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from fastapi import status
from sqlalchemy import Select, delete, select, text
from sqlalchemy.orm import Session as DBSession

from app.models import (
    Patient,
    PracticeProfile,
    Psychologist,
    SessionReminder,
    TimelineEvent,
)
from app.models import (
    Session as ClinicalSession,
)
from app.schemas.session import AgendaView, SessionActionRequest, SessionCreateRequest
from app.services.timeline_service import append_timeline_event

DEFAULT_REMINDER_HOURS = [24, 2]


class SessionServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class SessionCreationResult:
    session: ClinicalSession
    confirmation_token: str
    confirmation_link: str


@dataclass(frozen=True)
class ReminderRealtimeNotification:
    tenant_id: UUID
    patient_id: UUID
    session_id: UUID
    event_type: str
    title: str
    body: str


@dataclass(frozen=True)
class ReminderRunResult:
    processed: int
    sent: int
    failed: int
    notifications: list[ReminderRealtimeNotification]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _set_rls_bypass(db: DBSession) -> None:
    db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))


def _normalize_session_window(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    if start.tzinfo is None or end.tzinfo is None:
        raise SessionServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Horario de sessao deve incluir timezone.",
        )
    if end <= start:
        raise SessionServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Horario final deve ser maior que o horario inicial.",
        )
    return start, end


def _range_from_view(view: AgendaView, reference_date: date) -> tuple[datetime, datetime]:
    if view == "day":
        start_date = reference_date
        end_date = reference_date + timedelta(days=1)
    elif view == "week":
        start_date = reference_date - timedelta(days=reference_date.weekday())
        end_date = start_date + timedelta(days=7)
    else:
        start_date = reference_date.replace(day=1)
        if start_date.month == 12:
            end_date = date(start_date.year + 1, 1, 1)
        else:
            end_date = date(start_date.year, start_date.month + 1, 1)

    start_at = datetime.combine(start_date, time.min, tzinfo=UTC)
    end_at = datetime.combine(end_date, time.min, tzinfo=UTC)
    return start_at, end_at


def _resolve_reminder_hours(db: DBSession, *, tenant_id: UUID) -> list[int]:
    profile = db.scalar(select(PracticeProfile).where(PracticeProfile.tenant_id == tenant_id))
    if profile is None or len(profile.session_reminder_hours_before) == 0:
        return DEFAULT_REMINDER_HOURS
    return sorted(set(int(value) for value in profile.session_reminder_hours_before), reverse=True)


class SessionService:
    def get_psychologist_for_user(
        self,
        db: DBSession,
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
            raise SessionServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Psicologo nao encontrado para o usuario autenticado.",
            )
        return psychologist

    def _get_patient_for_tenant(
        self,
        db: DBSession,
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
            raise SessionServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente nao encontrado para criar sessao.",
            )
        return patient

    def get_session_for_tenant(
        self,
        db: DBSession,
        *,
        tenant_id: UUID,
        session_id: UUID,
    ) -> ClinicalSession | None:
        return db.scalar(
            select(ClinicalSession).where(
                ClinicalSession.tenant_id == tenant_id,
                ClinicalSession.id == session_id,
            )
        )

    def create_session(
        self,
        db: DBSession,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        payload: SessionCreateRequest,
        patient_sessions_base_url: str,
    ) -> SessionCreationResult:
        try:
            patient_uuid = UUID(payload.patient_id)
        except ValueError as exc:
            raise SessionServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="patient_id invalido.",
            ) from exc

        start_at, end_at = _normalize_session_window(
            payload.scheduled_start_at,
            payload.scheduled_end_at,
        )
        patient = self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_uuid)
        psychologist = self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        confirmation_token = secrets.token_urlsafe(32)
        confirmation_expires = max(end_at + timedelta(days=30), _utcnow() + timedelta(days=2))

        clinical_session = ClinicalSession(
            tenant_id=tenant_id,
            patient_id=patient.id,
            psychologist_id=psychologist.id,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
            scheduled_start_at=start_at,
            scheduled_end_at=end_at,
            status="scheduled",
            location_mode=payload.location_mode,
            meeting_link=_clean_optional(payload.meeting_link),
            notes=_clean_optional(payload.notes),
            confirmation_token_hash=_hash_token(confirmation_token),
            confirmation_token_expires_at=confirmation_expires,
        )
        db.add(clinical_session)
        db.flush()

        self.schedule_reminders_for_session(db, session=clinical_session)
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            session_id=clinical_session.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type="session_created",
            payload={
                "scheduled_start_at": start_at.isoformat(),
                "scheduled_end_at": end_at.isoformat(),
                "location_mode": clinical_session.location_mode,
            },
        )

        confirmation_link = (
            f"{patient_sessions_base_url.rstrip('/')}?token={confirmation_token}"
        )
        return SessionCreationResult(
            session=clinical_session,
            confirmation_token=confirmation_token,
            confirmation_link=confirmation_link,
        )

    def list_agenda(
        self,
        db: DBSession,
        *,
        tenant_id: UUID,
        view: AgendaView,
        reference_date: date,
    ) -> list[ClinicalSession]:
        start_at, end_at = _range_from_view(view, reference_date)
        query: Select[tuple[ClinicalSession]] = select(ClinicalSession).where(
            ClinicalSession.tenant_id == tenant_id,
            ClinicalSession.scheduled_start_at >= start_at,
            ClinicalSession.scheduled_start_at < end_at,
        )
        query = query.order_by(ClinicalSession.scheduled_start_at.asc())
        return list(db.scalars(query).all())

    def apply_action(
        self,
        db: DBSession,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        session_id: UUID,
        payload: SessionActionRequest,
    ) -> ClinicalSession:
        clinical_session = self.get_session_for_tenant(
            db,
            tenant_id=tenant_id,
            session_id=session_id,
        )
        if clinical_session is None:
            raise SessionServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sessao nao encontrada.",
            )

        if payload.action == "confirm":
            if clinical_session.status in {"canceled", "completed"}:
                raise SessionServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Sessao nao pode ser confirmada neste estado.",
                )

            clinical_session.status = "confirmed"
            clinical_session.confirmed_at = _utcnow()
            clinical_session.confirmed_by = "psychologist"
            clinical_session.updated_by_user_id = actor_user_id
            append_timeline_event(
                db,
                tenant_id=tenant_id,
                patient_id=clinical_session.patient_id,
                session_id=clinical_session.id,
                actor_type="psychologist",
                actor_id=actor_user_id,
                event_type="session_confirmed_by_psychologist",
                payload={},
            )
            return clinical_session

        if payload.action == "reschedule":
            if clinical_session.status in {"canceled", "completed"}:
                raise SessionServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Sessao nao pode ser remarcada neste estado.",
                )
            if payload.scheduled_start_at is None or payload.scheduled_end_at is None:
                raise SessionServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Remarcacao exige novo horario de inicio e fim.",
                )

            old_start_at = clinical_session.scheduled_start_at
            old_end_at = clinical_session.scheduled_end_at
            start_at, end_at = _normalize_session_window(
                payload.scheduled_start_at,
                payload.scheduled_end_at,
            )
            clinical_session.scheduled_start_at = start_at
            clinical_session.scheduled_end_at = end_at
            clinical_session.status = "rescheduled"
            clinical_session.rescheduled_at = _utcnow()
            clinical_session.updated_by_user_id = actor_user_id
            clinical_session.confirmed_by = None
            clinical_session.confirmed_at = None
            clinical_session.confirmation_token_expires_at = max(
                end_at + timedelta(days=30),
                _utcnow() + timedelta(days=2),
            )
            self.schedule_reminders_for_session(db, session=clinical_session)

            append_timeline_event(
                db,
                tenant_id=tenant_id,
                patient_id=clinical_session.patient_id,
                session_id=clinical_session.id,
                actor_type="psychologist",
                actor_id=actor_user_id,
                event_type="session_rescheduled",
                payload={
                    "old_start_at": old_start_at.isoformat(),
                    "old_end_at": old_end_at.isoformat(),
                    "new_start_at": start_at.isoformat(),
                    "new_end_at": end_at.isoformat(),
                    "reason": _clean_optional(payload.reason),
                },
            )
            return clinical_session

        if payload.action == "cancel":
            if clinical_session.status == "canceled":
                raise SessionServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Sessao ja esta cancelada.",
                )
            reason = _clean_optional(payload.reason)
            if reason is None:
                raise SessionServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Cancelamento exige justificativa.",
                )
            clinical_session.status = "canceled"
            clinical_session.canceled_at = _utcnow()
            clinical_session.cancellation_reason = reason
            clinical_session.updated_by_user_id = actor_user_id
            append_timeline_event(
                db,
                tenant_id=tenant_id,
                patient_id=clinical_session.patient_id,
                session_id=clinical_session.id,
                actor_type="psychologist",
                actor_id=actor_user_id,
                event_type="session_canceled",
                payload={"reason": reason},
            )
            return clinical_session

        if clinical_session.status in {"canceled", "completed"}:
            raise SessionServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sessao nao pode ser concluida neste estado.",
            )
        clinical_session.status = "completed"
        clinical_session.updated_by_user_id = actor_user_id
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=clinical_session.patient_id,
            session_id=clinical_session.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type="session_completed",
            payload={},
        )
        return clinical_session

    def _get_public_anchor_session(
        self,
        db: DBSession,
        *,
        confirmation_token: str,
    ) -> ClinicalSession:
        _set_rls_bypass(db)
        clinical_session = db.scalar(
            select(ClinicalSession).where(
                ClinicalSession.confirmation_token_hash == _hash_token(confirmation_token)
            )
        )
        if clinical_session is None:
            raise SessionServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Link de confirmacao invalido.",
            )
        if clinical_session.confirmation_token_expires_at <= _utcnow():
            raise SessionServiceError(
                status_code=status.HTTP_410_GONE,
                detail="Link de confirmacao expirado.",
            )
        return clinical_session

    def list_public_sessions_by_token(
        self,
        db: DBSession,
        *,
        confirmation_token: str,
    ) -> tuple[Patient, list[ClinicalSession]]:
        anchor = self._get_public_anchor_session(db, confirmation_token=confirmation_token)
        patient = db.scalar(
            select(Patient).where(
                Patient.id == anchor.patient_id,
                Patient.tenant_id == anchor.tenant_id,
            )
        )
        if patient is None:
            raise SessionServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente da sessao nao encontrado.",
            )

        sessions = list(
            db.scalars(
                select(ClinicalSession).where(
                    ClinicalSession.tenant_id == anchor.tenant_id,
                    ClinicalSession.patient_id == anchor.patient_id,
                    ClinicalSession.status.in_(
                        ["scheduled", "rescheduled", "confirmed", "completed"]
                    ),
                ).order_by(ClinicalSession.scheduled_start_at.asc())
            ).all()
        )
        return patient, sessions

    def confirm_public_session(
        self,
        db: DBSession,
        *,
        confirmation_token: str,
        session_id: UUID,
    ) -> ClinicalSession:
        anchor = self._get_public_anchor_session(db, confirmation_token=confirmation_token)
        clinical_session = db.scalar(
            select(ClinicalSession).where(
                ClinicalSession.id == session_id,
                ClinicalSession.tenant_id == anchor.tenant_id,
                ClinicalSession.patient_id == anchor.patient_id,
            )
        )
        if clinical_session is None:
            raise SessionServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sessao nao encontrada para este paciente.",
            )
        if clinical_session.status in {"canceled", "completed"}:
            raise SessionServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sessao nao pode ser confirmada neste estado.",
            )
        if clinical_session.status != "confirmed":
            clinical_session.status = "confirmed"
            clinical_session.confirmed_at = _utcnow()
            clinical_session.confirmed_by = "patient"
            append_timeline_event(
                db,
                tenant_id=clinical_session.tenant_id,
                patient_id=clinical_session.patient_id,
                session_id=clinical_session.id,
                actor_type="patient",
                event_type="session_confirmed_by_patient",
                payload={},
            )
        return clinical_session

    def list_session_timeline_events(
        self,
        db: DBSession,
        *,
        tenant_id: UUID,
        session_id: UUID,
        limit: int = 200,
    ) -> list[TimelineEvent]:
        query: Select[tuple[TimelineEvent]] = select(TimelineEvent).where(
            TimelineEvent.tenant_id == tenant_id,
            TimelineEvent.session_id == session_id,
        )
        query = query.order_by(TimelineEvent.created_at.desc()).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())

    def schedule_reminders_for_session(
        self,
        db: DBSession,
        *,
        session: ClinicalSession,
    ) -> list[SessionReminder]:
        reminder_hours = _resolve_reminder_hours(db, tenant_id=session.tenant_id)
        now = _utcnow()

        if session.status in {"canceled", "completed"}:
            db.execute(
                delete(SessionReminder).where(
                    SessionReminder.session_id == session.id,
                    SessionReminder.status == "queued",
                )
            )
            return []

        existing_reminders = list(
            db.scalars(
                select(SessionReminder).where(
                    SessionReminder.session_id == session.id,
                )
            ).all()
        )
        reminder_by_hour = {
            reminder.reminder_hours_before: reminder for reminder in existing_reminders
        }

        tracked_ids: set[UUID] = set()
        created_or_updated: list[SessionReminder] = []
        for hours_before in reminder_hours:
            scheduled_for = session.scheduled_start_at - timedelta(hours=hours_before)
            reminder = reminder_by_hour.get(hours_before)
            if reminder is None:
                reminder = SessionReminder(
                    tenant_id=session.tenant_id,
                    session_id=session.id,
                    patient_id=session.patient_id,
                    reminder_hours_before=hours_before,
                    scheduled_for=scheduled_for,
                    status="queued" if scheduled_for >= now else "queued",
                )
                db.add(reminder)
                db.flush()
            else:
                if reminder.status in {"queued", "failed"}:
                    reminder.scheduled_for = scheduled_for
                    reminder.status = "queued"
                    reminder.sent_at = None
                    reminder.failure_reason = None
            tracked_ids.add(reminder.id)
            created_or_updated.append(reminder)

        for reminder in existing_reminders:
            if reminder.id in tracked_ids:
                continue
            if reminder.status == "queued":
                db.delete(reminder)

        return created_or_updated

    def run_due_reminders_job(
        self,
        db: DBSession,
        *,
        now: datetime | None = None,
        tenant_id: UUID | None = None,
    ) -> ReminderRunResult:
        reference = now or _utcnow()
        query: Select[tuple[SessionReminder]] = select(SessionReminder).where(
            SessionReminder.status == "queued",
            SessionReminder.scheduled_for <= reference,
        )
        if tenant_id is not None:
            query = query.where(SessionReminder.tenant_id == tenant_id)
        due_reminders = list(db.scalars(query).all())

        processed = 0
        sent = 0
        failed = 0
        notifications: list[ReminderRealtimeNotification] = []

        for reminder in due_reminders:
            processed += 1
            clinical_session = db.scalar(
                select(ClinicalSession).where(ClinicalSession.id == reminder.session_id)
            )
            if clinical_session is None or clinical_session.status in {"canceled", "completed"}:
                reminder.status = "failed"
                reminder.failure_reason = "Sessao inativa para envio de lembrete."
                failed += 1
                continue

            reminder.status = "sent"
            reminder.sent_at = reference
            reminder.failure_reason = None
            sent += 1

            append_timeline_event(
                db,
                tenant_id=reminder.tenant_id,
                patient_id=reminder.patient_id,
                session_id=reminder.session_id,
                actor_type="system",
                event_type="session_reminder_sent",
                payload={
                    "reminder_hours_before": reminder.reminder_hours_before,
                    "scheduled_for": reminder.scheduled_for.isoformat(),
                },
            )
            notifications.append(
                ReminderRealtimeNotification(
                    tenant_id=reminder.tenant_id,
                    patient_id=reminder.patient_id,
                    session_id=reminder.session_id,
                    event_type="session_reminder_sent",
                    title="Lembrete de sessao enviado",
                    body=(
                        "Sessao com lembrete enviado "
                        f"({reminder.reminder_hours_before}h antes do inicio)."
                    ),
                )
            )

        return ReminderRunResult(
            processed=processed,
            sent=sent,
            failed=failed,
            notifications=notifications,
        )


session_service = SessionService()
