import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import status
from sqlalchemy import Select, select, text
from sqlalchemy.orm import Session

from app.models import (
    Activity,
    ActivityTemplate,
    AssignmentIdempotencyKey,
    ClinicalForm,
    FormTemplate,
    Patient,
    Psychologist,
)
from app.schemas.activity import ActivityRecurrenceRule
from app.schemas.template import (
    ActivityTemplateAssignRequest,
    ActivityTemplateCreateRequest,
    ActivityTemplateUpdateRequest,
    FormTemplateAssignRequest,
    FormTemplateCreateRequest,
    FormTemplateUpdateRequest,
)
from app.services.form_service import _normalize_sections
from app.services.timeline_service import append_timeline_event

ACTIVITY_STATUS_SCHEDULED = "scheduled"
ACTIVITY_STATUS_ASSIGNED = "assigned"

FORM_STATUS_SCHEDULED = "scheduled"
FORM_STATUS_ASSIGNED = "assigned"


class TemplateAssignmentServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ActivityTemplateAssignResult:
    activity: Activity
    replayed: bool


@dataclass(frozen=True)
class FormTemplateAssignResult:
    form: ClinicalForm
    replayed: bool


@dataclass(frozen=True)
class ActivitiesDispatchRunResult:
    processed: int
    dispatched: int
    dispatched_activities: list[Activity]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalize_datetime(*, value: datetime, field_name: str) -> datetime:
    if value.tzinfo is None:
        raise TemplateAssignmentServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} deve incluir timezone.",
        )
    return value


def _normalize_send_mode(
    *,
    send_mode: str,
    scheduled_send_at: datetime | None,
    now: datetime,
) -> datetime | None:
    if send_mode == "immediate":
        return None

    if scheduled_send_at is None:
        raise TemplateAssignmentServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envio agendado exige scheduled_send_at.",
        )

    normalized = _normalize_datetime(
        value=scheduled_send_at,
        field_name="scheduled_send_at",
    )
    if normalized <= now:
        raise TemplateAssignmentServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scheduled_send_at deve ser no futuro.",
        )
    return normalized


def _normalize_due_at(value: datetime) -> datetime:
    return _normalize_datetime(value=value, field_name="due_at")


def _normalize_recurrence(
    *,
    recurrence_rule: ActivityRecurrenceRule,
    recurrence_interval: int,
    recurrence_end_at: datetime | None,
    due_at: datetime,
) -> tuple[ActivityRecurrenceRule, int, datetime | None]:
    if recurrence_rule == "none":
        return "none", 1, None

    if recurrence_end_at is None:
        return recurrence_rule, recurrence_interval, None

    normalized_end = _normalize_datetime(
        value=recurrence_end_at,
        field_name="recurrence_end_at",
    )
    if normalized_end <= due_at:
        raise TemplateAssignmentServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="recurrence_end_at deve ser maior que due_at.",
        )
    return recurrence_rule, recurrence_interval, normalized_end


def _sections_payload(
    sections_payload: list[dict[str, Any]],
) -> dict[str, object]:
    return {
        "sections": _normalize_sections(sections_payload),
    }


def _json_fingerprint(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_activity_token_window(*, due_at: datetime, now: datetime) -> tuple[str, datetime]:
    expires_at = max(now + timedelta(days=30), due_at + timedelta(days=180))
    token = secrets.token_urlsafe(32)
    return token, expires_at


class TemplateAssignmentService:
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
            raise TemplateAssignmentServiceError(
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
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente nao encontrado para atribuicao.",
            )
        return patient

    def _insert_idempotency_if_absent(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        operation: str,
        idempotency_key: str,
        request_fingerprint: str,
        resource_type: str,
    ) -> UUID | None:
        inserted = db.scalar(
            text(
                """
                INSERT INTO assignment_idempotency_keys (
                    id,
                    tenant_id,
                    created_by_user_id,
                    operation,
                    idempotency_key,
                    request_fingerprint,
                    resource_type,
                    resource_id,
                    created_at,
                    updated_at
                ) VALUES (
                    :id,
                    :tenant_id,
                    :created_by_user_id,
                    :operation,
                    :idempotency_key,
                    :request_fingerprint,
                    :resource_type,
                    NULL,
                    now(),
                    now()
                )
                ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING
                RETURNING id
                """
            ),
            {
                "id": str(uuid4()),
                "tenant_id": str(tenant_id),
                "created_by_user_id": str(actor_user_id),
                "operation": operation,
                "idempotency_key": idempotency_key,
                "request_fingerprint": request_fingerprint,
                "resource_type": resource_type,
            },
        )
        if inserted is None:
            return None
        return UUID(str(inserted))

    def _resolve_existing_idempotency(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        operation: str,
        idempotency_key: str,
    ) -> AssignmentIdempotencyKey:
        record = db.scalar(
            select(AssignmentIdempotencyKey).where(
                AssignmentIdempotencyKey.tenant_id == tenant_id,
                AssignmentIdempotencyKey.operation == operation,
                AssignmentIdempotencyKey.idempotency_key == idempotency_key,
            )
        )
        if record is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Falha ao resolver idempotencia da atribuicao.",
            )
        return record

    def _claim_idempotency(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        operation: str,
        idempotency_key: str,
        request_fingerprint: str,
        resource_type: str,
    ) -> tuple[AssignmentIdempotencyKey, bool]:
        inserted_id = self._insert_idempotency_if_absent(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            resource_type=resource_type,
        )

        if inserted_id is not None:
            record = db.scalar(
                select(AssignmentIdempotencyKey).where(AssignmentIdempotencyKey.id == inserted_id)
            )
            if record is None:
                raise TemplateAssignmentServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Falha ao registrar idempotencia da atribuicao.",
                )
            return record, False

        record = self._resolve_existing_idempotency(
            db,
            tenant_id=tenant_id,
            operation=operation,
            idempotency_key=idempotency_key,
        )
        if record.request_fingerprint != request_fingerprint:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key reutilizado com payload diferente.",
            )
        return record, True

    def list_activity_templates(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> list[ActivityTemplate]:
        query: Select[tuple[ActivityTemplate]] = select(ActivityTemplate).where(
            ActivityTemplate.tenant_id == tenant_id
        )
        if not include_archived:
            query = query.where(ActivityTemplate.archived_at.is_(None))
        query = query.order_by(ActivityTemplate.updated_at.desc())
        query = query.limit(max(1, min(limit, 500))).offset(max(0, offset))
        return list(db.scalars(query).all())

    def get_activity_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        template_id: UUID,
        include_archived: bool = False,
    ) -> ActivityTemplate | None:
        query: Select[tuple[ActivityTemplate]] = select(ActivityTemplate).where(
            ActivityTemplate.tenant_id == tenant_id,
            ActivityTemplate.id == template_id,
        )
        if not include_archived:
            query = query.where(ActivityTemplate.archived_at.is_(None))
        return db.scalar(query)

    def create_activity_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        payload: ActivityTemplateCreateRequest,
    ) -> ActivityTemplate:
        psychologist = self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        document_url = _clean_optional(payload.document_url)
        if payload.activity_type == "document_reading" and document_url is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Template document_reading exige document_url.",
            )

        template = ActivityTemplate(
            tenant_id=tenant_id,
            psychologist_id=psychologist.id,
            title=payload.title.strip(),
            description=_clean_optional(payload.description),
            instructions=_clean_optional(payload.instructions),
            document_url=document_url,
            configuration=payload.configuration or {},
            activity_type=payload.activity_type,
        )
        db.add(template)
        db.flush()
        return template

    def update_activity_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        template_id: UUID,
        payload: ActivityTemplateUpdateRequest,
    ) -> ActivityTemplate:
        template = self.get_activity_template(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
        )
        if template is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template de atividade nao encontrado.",
            )

        self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        if payload.title is not None:
            template.title = payload.title.strip()
        if payload.description is not None:
            template.description = _clean_optional(payload.description)
        if payload.instructions is not None:
            template.instructions = _clean_optional(payload.instructions)
        if payload.document_url is not None:
            template.document_url = _clean_optional(payload.document_url)
        if payload.configuration is not None:
            template.configuration = payload.configuration
        if payload.activity_type is not None:
            template.activity_type = payload.activity_type

        if (
            template.activity_type == "document_reading"
            and _clean_optional(template.document_url) is None
        ):
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Template document_reading exige document_url.",
            )
        db.flush()
        return template

    def archive_activity_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        template_id: UUID,
    ) -> ActivityTemplate:
        template = self.get_activity_template(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
        )
        if template is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template de atividade nao encontrado.",
            )
        self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        if template.archived_at is None:
            template.archived_at = _utcnow()
            db.flush()
        return template

    def list_form_templates(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> list[FormTemplate]:
        query: Select[tuple[FormTemplate]] = select(FormTemplate).where(
            FormTemplate.tenant_id == tenant_id
        )
        if not include_archived:
            query = query.where(FormTemplate.archived_at.is_(None))
        query = query.order_by(FormTemplate.updated_at.desc())
        query = query.limit(max(1, min(limit, 500))).offset(max(0, offset))
        return list(db.scalars(query).all())

    def get_form_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        template_id: UUID,
        include_archived: bool = False,
    ) -> FormTemplate | None:
        query: Select[tuple[FormTemplate]] = select(FormTemplate).where(
            FormTemplate.tenant_id == tenant_id,
            FormTemplate.id == template_id,
        )
        if not include_archived:
            query = query.where(FormTemplate.archived_at.is_(None))
        return db.scalar(query)

    def create_form_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        payload: FormTemplateCreateRequest,
    ) -> FormTemplate:
        psychologist = self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        sections_payload = [section.model_dump(mode="json") for section in payload.sections]
        template = FormTemplate(
            tenant_id=tenant_id,
            psychologist_id=psychologist.id,
            title=payload.title.strip(),
            subtitle=_clean_optional(payload.subtitle),
            header=_clean_optional(payload.header),
            builder_schema=_sections_payload(sections_payload),
        )
        db.add(template)
        db.flush()
        return template

    def update_form_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        template_id: UUID,
        payload: FormTemplateUpdateRequest,
    ) -> FormTemplate:
        template = self.get_form_template(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
        )
        if template is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template de formulario nao encontrado.",
            )

        self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        if payload.title is not None:
            template.title = payload.title.strip()
        if payload.subtitle is not None:
            template.subtitle = _clean_optional(payload.subtitle)
        if payload.header is not None:
            template.header = _clean_optional(payload.header)
        if payload.sections is not None:
            sections_payload = [
                section.model_dump(mode="json")
                for section in payload.sections
            ]
            template.builder_schema = _sections_payload(sections_payload)

        db.flush()
        return template

    def archive_form_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        template_id: UUID,
    ) -> FormTemplate:
        template = self.get_form_template(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
        )
        if template is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template de formulario nao encontrado.",
            )
        self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )
        if template.archived_at is None:
            template.archived_at = _utcnow()
            db.flush()
        return template

    def assign_activity_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        template_id: UUID,
        payload: ActivityTemplateAssignRequest,
        idempotency_key: str,
    ) -> ActivityTemplateAssignResult:
        template = self.get_activity_template(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
        )
        if template is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template de atividade nao encontrado.",
            )

        now = _utcnow()
        scheduled_send_at = _normalize_send_mode(
            send_mode=payload.send_mode,
            scheduled_send_at=payload.scheduled_send_at,
            now=now,
        )

        due_at = _normalize_due_at(payload.due_at)

        override = payload.overrides
        recurrence_rule = (
            override.recurrence_rule
            if override and override.recurrence_rule
            else "none"
        )
        recurrence_interval = (
            override.recurrence_interval
            if override and override.recurrence_interval is not None
            else 1
        )
        recurrence_end_at = override.recurrence_end_at if override else None
        recurrence_rule, recurrence_interval, recurrence_end_at = _normalize_recurrence(
            recurrence_rule=recurrence_rule,
            recurrence_interval=recurrence_interval,
            recurrence_end_at=recurrence_end_at,
            due_at=due_at,
        )

        try:
            patient_id = UUID(payload.patient_id)
        except ValueError as exc:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="patient_id invalido.",
            ) from exc

        patient = self._get_patient_for_tenant(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
        )
        psychologist = self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        title = (
            override.title.strip()
            if override and override.title is not None
            else template.title
        )
        description = (
            _clean_optional(override.description)
            if override and override.description is not None
            else template.description
        )
        instructions = (
            _clean_optional(override.instructions)
            if override and override.instructions is not None
            else template.instructions
        )
        document_url = (
            _clean_optional(override.document_url)
            if override and override.document_url is not None
            else template.document_url
        )
        configuration = (
            override.configuration
            if override and override.configuration is not None
            else template.configuration
        )
        activity_type = (
            override.activity_type
            if override and override.activity_type is not None
            else template.activity_type
        )

        if activity_type == "document_reading" and _clean_optional(document_url) is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Atividade document_reading exige document_url.",
            )

        request_fingerprint = _json_fingerprint(
            {
                "template_id": str(template_id),
                **payload.model_dump(mode="json", exclude_none=True),
            }
        )
        operation = f"activity_template_assign:{template_id}"
        idempotency_record, is_replay = self._claim_idempotency(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            resource_type="activity",
        )

        if is_replay:
            if idempotency_record.resource_id is None:
                raise TemplateAssignmentServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atribuicao com esta chave esta em processamento.",
                )
            existing = db.scalar(
                select(Activity).where(
                    Activity.id == idempotency_record.resource_id,
                    Activity.tenant_id == tenant_id,
                )
            )
            if existing is None:
                raise TemplateAssignmentServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atribuicao idempotente nao encontrada para replay.",
                )
            return ActivityTemplateAssignResult(activity=existing, replayed=True)

        token, expires_at = _build_activity_token_window(due_at=due_at, now=now)
        final_status = (
            ACTIVITY_STATUS_ASSIGNED
            if payload.send_mode == "immediate"
            else ACTIVITY_STATUS_SCHEDULED
        )

        activity = Activity(
            tenant_id=tenant_id,
            patient_id=patient.id,
            psychologist_id=psychologist.id,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
            source_activity_id=None,
            source_template_id=template.id,
            activity_type=activity_type,
            title=title,
            description=description,
            instructions=instructions,
            document_url=document_url,
            configuration=configuration,
            status=final_status,
            due_at=due_at,
            scheduled_send_at=scheduled_send_at,
            assigned_at=now,
            recurrence_rule=recurrence_rule,
            recurrence_interval=recurrence_interval,
            recurrence_end_at=recurrence_end_at,
            execution_elapsed_seconds=0,
            patient_access_token_hash=_hash_token(token),
            patient_access_token_expires_at=expires_at,
        )
        db.add(activity)
        db.flush()

        timeline_event_type = "assigned" if payload.send_mode == "immediate" else "scheduled"
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            activity_id=activity.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type=timeline_event_type,
            payload={
                "send_mode": payload.send_mode,
                "scheduled_send_at": scheduled_send_at.isoformat()
                if scheduled_send_at is not None
                else None,
                "source_template_id": str(template.id),
                "title": activity.title,
                "due_at": activity.due_at.isoformat(),
            },
        )

        idempotency_record.resource_id = activity.id
        db.flush()
        return ActivityTemplateAssignResult(activity=activity, replayed=False)

    def dispatch_scheduled_activities(
        self,
        db: Session,
        *,
        tenant_id: UUID | None = None,
        now: datetime | None = None,
    ) -> ActivitiesDispatchRunResult:
        reference = now or _utcnow()
        query: Select[tuple[Activity]] = select(Activity).where(
            Activity.status == ACTIVITY_STATUS_SCHEDULED,
            Activity.scheduled_send_at.is_not(None),
            Activity.scheduled_send_at <= reference,
        )
        if tenant_id is not None:
            query = query.where(Activity.tenant_id == tenant_id)

        scheduled = list(db.scalars(query).all())
        dispatched = 0
        dispatched_activities: list[Activity] = []

        for activity in scheduled:
            activity.status = ACTIVITY_STATUS_ASSIGNED
            activity.assigned_at = reference
            append_timeline_event(
                db,
                tenant_id=activity.tenant_id,
                patient_id=activity.patient_id,
                activity_id=activity.id,
                actor_type="system",
                event_type="assigned",
                payload={
                    "send_mode": "scheduled",
                    "scheduled_send_at": activity.scheduled_send_at.isoformat()
                    if activity.scheduled_send_at is not None
                    else None,
                    "source_template_id": str(activity.source_template_id)
                    if activity.source_template_id is not None
                    else None,
                },
            )
            dispatched += 1
            dispatched_activities.append(activity)

        return ActivitiesDispatchRunResult(
            processed=len(scheduled),
            dispatched=dispatched,
            dispatched_activities=dispatched_activities,
        )

    def assign_form_template(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        template_id: UUID,
        payload: FormTemplateAssignRequest,
        idempotency_key: str,
    ) -> FormTemplateAssignResult:
        template = self.get_form_template(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
        )
        if template is None:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template de formulario nao encontrado.",
            )

        now = _utcnow()
        scheduled_send_at = _normalize_send_mode(
            send_mode=payload.send_mode,
            scheduled_send_at=payload.scheduled_send_at,
            now=now,
        )

        try:
            patient_id = UUID(payload.patient_id)
        except ValueError as exc:
            raise TemplateAssignmentServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="patient_id invalido.",
            ) from exc

        patient = self._get_patient_for_tenant(
            db,
            tenant_id=tenant_id,
            patient_id=patient_id,
        )
        psychologist = self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        override = payload.overrides
        title = (
            override.title.strip()
            if override and override.title is not None
            else template.title
        )
        subtitle = (
            _clean_optional(override.subtitle)
            if override and override.subtitle is not None
            else template.subtitle
        )
        header = (
            _clean_optional(override.header)
            if override and override.header is not None
            else template.header
        )

        if override and override.sections is not None:
            sections_payload = [
                section.model_dump(mode="json")
                for section in override.sections
            ]
            builder_schema: dict[str, object] = _sections_payload(sections_payload)
        else:
            builder_schema = template.builder_schema

        request_fingerprint = _json_fingerprint(
            {
                "template_id": str(template_id),
                **payload.model_dump(mode="json", exclude_none=True),
            }
        )
        operation = f"form_template_assign:{template_id}"
        idempotency_record, is_replay = self._claim_idempotency(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            operation=operation,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            resource_type="form",
        )

        if is_replay:
            if idempotency_record.resource_id is None:
                raise TemplateAssignmentServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atribuicao com esta chave esta em processamento.",
                )
            existing = db.scalar(
                select(ClinicalForm).where(
                    ClinicalForm.id == idempotency_record.resource_id,
                    ClinicalForm.tenant_id == tenant_id,
                )
            )
            if existing is None:
                raise TemplateAssignmentServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Atribuicao idempotente nao encontrada para replay.",
                )
            return FormTemplateAssignResult(form=existing, replayed=True)

        access_token = secrets.token_urlsafe(32)
        final_status = (
            FORM_STATUS_ASSIGNED
            if payload.send_mode == "immediate"
            else FORM_STATUS_SCHEDULED
        )
        form = ClinicalForm(
            tenant_id=tenant_id,
            patient_id=patient.id,
            psychologist_id=psychologist.id,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
            source_template_id=template.id,
            title=title,
            subtitle=subtitle,
            header=header,
            builder_schema=builder_schema,
            response_data=None,
            status=final_status,
            published_at=now,
            scheduled_send_at=scheduled_send_at,
            assigned_at=now if payload.send_mode == "immediate" else None,
            patient_access_token_hash=_hash_token(access_token),
            patient_access_token_expires_at=now + timedelta(days=180),
        )
        db.add(form)
        db.flush()

        timeline_event_type = "assigned" if payload.send_mode == "immediate" else "scheduled"
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            form_id=form.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type=timeline_event_type,
            payload={
                "send_mode": payload.send_mode,
                "scheduled_send_at": scheduled_send_at.isoformat()
                if scheduled_send_at is not None
                else None,
                "source_template_id": str(template.id),
                "title": form.title,
            },
        )

        idempotency_record.resource_id = form.id
        db.flush()
        return FormTemplateAssignResult(form=form, replayed=False)


template_assignment_service = TemplateAssignmentService()
