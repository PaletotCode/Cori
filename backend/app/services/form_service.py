import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import status
from sqlalchemy import Select, select, text
from sqlalchemy.orm import Session

from app.models import ClinicalForm, Patient, Psychologist, TimelineEvent
from app.schemas.form import (
    ClinicalFormCreateRequest,
    ClinicalFormPatientActionRequest,
    ClinicalFormPsychologistActionRequest,
    ClinicalFormUpdateRequest,
)
from app.services.timeline_service import append_timeline_event

FORM_STATUS_DRAFT = "draft"
FORM_STATUS_PUBLISHED = "published"
FORM_STATUS_SCHEDULED = "scheduled"
FORM_STATUS_ASSIGNED = "assigned"
FORM_STATUS_OPENED = "opened"
FORM_STATUS_PARTIAL_SAVED = "partial_saved"
FORM_STATUS_SUBMITTED = "submitted"
FORM_STATUS_REVIEWED = "reviewed"

FORM_ACTIVE_PATIENT_STATUSES = {
    FORM_STATUS_ASSIGNED,
    FORM_STATUS_OPENED,
    FORM_STATUS_PARTIAL_SAVED,
}

FORM_VISIBLE_TO_PATIENT_STATUSES = {
    FORM_STATUS_ASSIGNED,
    FORM_STATUS_OPENED,
    FORM_STATUS_PARTIAL_SAVED,
    FORM_STATUS_SUBMITTED,
    FORM_STATUS_REVIEWED,
}


class FormServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ClinicalFormCreationResult:
    form: ClinicalForm
    patient_access_token: str
    patient_access_link: str


@dataclass(frozen=True)
class FormsDispatchRunResult:
    processed: int
    dispatched: int
    dispatched_forms: list[ClinicalForm]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _set_rls_bypass(db: Session) -> None:
    db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))


def _set_current_tenant(db: Session, *, tenant_id: UUID) -> None:
    db.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant_id)},
    )


def _normalize_datetime(value: datetime, *, field_name: str) -> datetime:
    if value.tzinfo is None:
        raise FormServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} deve incluir timezone.",
        )
    return value


def _normalize_options(raw_options: list[str] | None) -> list[str] | None:
    if raw_options is None:
        return None
    normalized: list[str] = []
    seen: set[str] = set()
    for option in raw_options:
        cleaned = option.strip()
        if len(cleaned) == 0:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cleaned)
    return normalized or None


def _normalize_sections(
    sections_payload: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized_sections: list[dict[str, Any]] = []
    section_ids_seen: set[str] = set()
    question_ids_seen: set[str] = set()
    question_counter = 0

    for section_index, section in enumerate(sections_payload, start=1):
        section_id_raw = str(section.get("section_id") or f"s{section_index}").strip()
        if len(section_id_raw) == 0:
            section_id_raw = f"s{section_index}"
        if section_id_raw in section_ids_seen:
            raise FormServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"section_id duplicado no builder: {section_id_raw}.",
            )
        section_ids_seen.add(section_id_raw)

        section_title = str(section.get("title") or "").strip()
        if len(section_title) < 2:
            raise FormServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cada secao do builder deve ter titulo com ao menos 2 caracteres.",
            )
        section_description = _clean_optional(
            str(section.get("description")) if section.get("description") is not None else None
        )
        raw_questions = section.get("questions")
        if not isinstance(raw_questions, list) or len(raw_questions) == 0:
            raise FormServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Secao {section_title} deve ter ao menos uma pergunta.",
            )

        normalized_questions: list[dict[str, Any]] = []
        for question in raw_questions:
            question_counter += 1
            if not isinstance(question, dict):
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Pergunta do builder invalida.",
                )

            question_id_raw = str(question.get("question_id") or f"q{question_counter}").strip()
            if len(question_id_raw) == 0:
                question_id_raw = f"q{question_counter}"
            if question_id_raw in question_ids_seen:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"question_id duplicado no builder: {question_id_raw}.",
                )
            question_ids_seen.add(question_id_raw)

            label = str(question.get("label") or "").strip()
            if len(label) < 3:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Perguntas do builder exigem label com ao menos 3 caracteres.",
                )

            field_type = str(question.get("field_type") or "").strip()
            if field_type not in {
                "short_text",
                "long_text",
                "multiple_choice",
                "checkbox",
                "scale",
                "date_time",
            }:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Tipo de campo nao suportado: {field_type}.",
                )

            required = bool(question.get("required", True))
            help_text = _clean_optional(
                str(question.get("help_text")) if question.get("help_text") is not None else None
            )
            options = _normalize_options(question.get("options"))
            scale_min_raw = question.get("scale_min")
            scale_max_raw = question.get("scale_max")
            scale_min = int(scale_min_raw) if scale_min_raw is not None else None
            scale_max = int(scale_max_raw) if scale_max_raw is not None else None

            if field_type in {"multiple_choice", "checkbox"}:
                if options is None or len(options) == 0:
                    raise FormServiceError(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Pergunta {question_id_raw} exige opcoes.",
                    )
                scale_min = None
                scale_max = None
            elif field_type == "scale":
                if scale_min is None or scale_max is None:
                    raise FormServiceError(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Pergunta {question_id_raw} exige scale_min e scale_max.",
                    )
                if scale_max <= scale_min:
                    raise FormServiceError(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Pergunta {question_id_raw} exige escala crescente.",
                    )
                options = None
            else:
                options = None
                scale_min = None
                scale_max = None

            normalized_questions.append(
                {
                    "question_id": question_id_raw,
                    "label": label,
                    "field_type": field_type,
                    "required": required,
                    "help_text": help_text,
                    "options": options,
                    "scale_min": scale_min,
                    "scale_max": scale_max,
                }
            )

        normalized_sections.append(
            {
                "section_id": section_id_raw,
                "title": section_title,
                "description": section_description,
                "questions": normalized_questions,
            }
        )

    return normalized_sections


def _builder_to_sections_payload(
    payload: ClinicalFormCreateRequest | ClinicalFormUpdateRequest,
) -> list[dict[str, Any]] | None:
    if payload.sections is None:
        return None
    return [section.model_dump(mode="json") for section in payload.sections]


def _build_question_catalog(form: ClinicalForm) -> dict[str, dict[str, Any]]:
    raw_builder = form.builder_schema or {}
    sections_raw = raw_builder.get("sections")
    if not isinstance(sections_raw, list):
        raise FormServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Builder do formulario invalido.",
        )

    catalog: dict[str, dict[str, Any]] = {}
    for section in sections_raw:
        if not isinstance(section, dict):
            continue
        questions = section.get("questions")
        if not isinstance(questions, list):
            continue
        for question in questions:
            if not isinstance(question, dict):
                continue
            question_id = str(question.get("question_id") or "").strip()
            if len(question_id) == 0:
                continue
            catalog[question_id] = question
    return catalog


def _normalize_date_time_answer(value: str) -> str:
    parsed_input = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(parsed_input)
    except ValueError as exc:
        raise FormServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Campo date_time exige valor ISO valido.",
        ) from exc
    return parsed.isoformat()


def _validate_answers(
    form: ClinicalForm,
    *,
    answers: dict[str, object],
    require_complete: bool,
) -> dict[str, object]:
    question_catalog = _build_question_catalog(form)
    if len(question_catalog) == 0:
        raise FormServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Builder do formulario sem perguntas validas.",
        )

    normalized_answers: dict[str, object] = {}
    for question_id, raw_value in answers.items():
        question = question_catalog.get(question_id)
        if question is None:
            raise FormServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Resposta recebida para pergunta inexistente: {question_id}.",
            )
        field_type = str(question.get("field_type"))
        required = bool(question.get("required", True))
        options = question.get("options")

        if field_type in {"short_text", "long_text"}:
            if not isinstance(raw_value, str):
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} exige texto.",
                )
            cleaned = raw_value.strip()
            if required and len(cleaned) == 0:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta obrigatoria sem resposta: {question_id}.",
                )
            if len(cleaned) > 0:
                normalized_answers[question_id] = cleaned
            continue

        if field_type == "multiple_choice":
            if not isinstance(raw_value, str):
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} exige opcao unica.",
                )
            cleaned = raw_value.strip()
            valid_options = options if isinstance(options, list) else []
            if cleaned not in valid_options:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} recebeu opcao invalida.",
                )
            normalized_answers[question_id] = cleaned
            continue

        if field_type == "checkbox":
            if not isinstance(raw_value, list):
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} exige lista de opcoes.",
                )
            valid_options_set = set(options if isinstance(options, list) else [])
            cleaned_values: list[str] = []
            for item in raw_value:
                if not isinstance(item, str):
                    raise FormServiceError(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Pergunta {question_id} contem valor nao textual.",
                    )
                cleaned = item.strip()
                if cleaned in valid_options_set and cleaned not in cleaned_values:
                    cleaned_values.append(cleaned)
            if required and len(cleaned_values) == 0:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta obrigatoria sem resposta: {question_id}.",
                )
            if len(cleaned_values) > 0:
                normalized_answers[question_id] = cleaned_values
            continue

        if field_type == "scale":
            if isinstance(raw_value, bool):
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} exige valor numerico.",
                )
            if not isinstance(raw_value, int | float | str):
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} exige valor numerico.",
                )
            value = int(raw_value)
            scale_min = int(question.get("scale_min", 0))
            scale_max = int(question.get("scale_max", 0))
            if value < scale_min or value > scale_max:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} recebeu valor fora da escala.",
                )
            normalized_answers[question_id] = value
            continue

        if field_type == "date_time":
            if not isinstance(raw_value, str):
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta {question_id} exige data/hora textual.",
                )
            cleaned = raw_value.strip()
            if required and len(cleaned) == 0:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Pergunta obrigatoria sem resposta: {question_id}.",
                )
            if len(cleaned) > 0:
                normalized_answers[question_id] = _normalize_date_time_answer(cleaned)
            continue

    if require_complete:
        missing_required = [
            question_id
            for question_id, question in question_catalog.items()
            if bool(question.get("required", True)) and question_id not in normalized_answers
        ]
        if len(missing_required) > 0:
            raise FormServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Envio final exige resposta de todas as perguntas obrigatorias: "
                    f"{', '.join(sorted(missing_required))}."
                ),
            )

    return normalized_answers


def _required_question_count(form: ClinicalForm) -> int:
    catalog = _build_question_catalog(form)
    return sum(1 for question in catalog.values() if bool(question.get("required", True)))


def _build_patient_link(base_url: str, token: str) -> str:
    return f"{base_url.rstrip('/')}?token={token}"


class FormService:
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
            raise FormServiceError(
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
            raise FormServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente nao encontrado para atribuicao do formulario.",
            )
        return patient

    def get_form_for_tenant(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        form_id: UUID,
    ) -> ClinicalForm | None:
        return db.scalar(
            select(ClinicalForm).where(
                ClinicalForm.tenant_id == tenant_id,
                ClinicalForm.id == form_id,
            )
        )

    def create_form(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        payload: ClinicalFormCreateRequest,
        patient_forms_base_url: str,
    ) -> ClinicalFormCreationResult:
        try:
            patient_uuid = UUID(payload.patient_id)
        except ValueError as exc:
            raise FormServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="patient_id invalido.",
            ) from exc

        normalized_sections = _normalize_sections(
            _builder_to_sections_payload(payload) or []
        )
        patient = self._get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_uuid)
        psychologist = self.get_psychologist_for_user(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
        )

        access_token = secrets.token_urlsafe(32)
        access_expires_at = _utcnow() + timedelta(days=180)
        form = ClinicalForm(
            tenant_id=tenant_id,
            patient_id=patient.id,
            psychologist_id=psychologist.id,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
            title=payload.title.strip(),
            subtitle=_clean_optional(payload.subtitle),
            header=_clean_optional(payload.header),
            builder_schema={"sections": normalized_sections},
            response_data=None,
            status=FORM_STATUS_DRAFT,
            patient_access_token_hash=_hash_token(access_token),
            patient_access_token_expires_at=access_expires_at,
        )
        db.add(form)
        db.flush()

        return ClinicalFormCreationResult(
            form=form,
            patient_access_token=access_token,
            patient_access_link=_build_patient_link(patient_forms_base_url, access_token),
        )

    def list_forms(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID | None = None,
        status_filter: str | None = None,
        limit: int = 200,
    ) -> list[ClinicalForm]:
        query: Select[tuple[ClinicalForm]] = select(ClinicalForm).where(
            ClinicalForm.tenant_id == tenant_id
        )
        if patient_id is not None:
            query = query.where(ClinicalForm.patient_id == patient_id)
        if status_filter is not None:
            query = query.where(ClinicalForm.status == status_filter)
        query = query.order_by(ClinicalForm.created_at.desc()).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())

    def list_received_forms(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        limit: int = 200,
    ) -> list[ClinicalForm]:
        query: Select[tuple[ClinicalForm]] = select(ClinicalForm).where(
            ClinicalForm.tenant_id == tenant_id,
            ClinicalForm.status.in_([FORM_STATUS_SUBMITTED, FORM_STATUS_REVIEWED]),
        )
        query = query.order_by(
            ClinicalForm.submitted_at.desc().nullslast(),
            ClinicalForm.updated_at.desc(),
        ).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())

    def update_form(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        form_id: UUID,
        payload: ClinicalFormUpdateRequest,
    ) -> ClinicalForm:
        form = self.get_form_for_tenant(db, tenant_id=tenant_id, form_id=form_id)
        if form is None:
            raise FormServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Formulario nao encontrado.",
            )
        if form.status not in {FORM_STATUS_DRAFT, FORM_STATUS_PUBLISHED, FORM_STATUS_SCHEDULED}:
            raise FormServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Formulario em execucao/resposta nao pode ser editado.",
            )

        if payload.title is not None:
            form.title = payload.title.strip()
        if payload.subtitle is not None:
            form.subtitle = _clean_optional(payload.subtitle)
        if payload.header is not None:
            form.header = _clean_optional(payload.header)
        if payload.sections is not None:
            form.builder_schema = {
                "sections": _normalize_sections(
                    _builder_to_sections_payload(payload) or []
                )
            }
        form.updated_by_user_id = actor_user_id
        return form

    def apply_psychologist_action(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        form_id: UUID,
        payload: ClinicalFormPsychologistActionRequest,
    ) -> ClinicalForm:
        form = self.get_form_for_tenant(db, tenant_id=tenant_id, form_id=form_id)
        if form is None:
            raise FormServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Formulario nao encontrado.",
            )
        now = _utcnow()
        form.updated_by_user_id = actor_user_id

        if payload.action == "publish":
            if form.status in {FORM_STATUS_SUBMITTED, FORM_STATUS_REVIEWED}:
                raise FormServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Formulario respondido nao pode retornar para publicado.",
                )
            form.status = FORM_STATUS_PUBLISHED
            form.published_at = now
            return form

        if payload.action == "send":
            if form.status in {FORM_STATUS_SUBMITTED, FORM_STATUS_REVIEWED}:
                raise FormServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Formulario respondido nao pode ser reenviado sem nova versao.",
                )
            if form.published_at is None:
                form.published_at = now
            form.status = FORM_STATUS_ASSIGNED
            form.assigned_at = now
            form.scheduled_send_at = None
            append_timeline_event(
                db,
                tenant_id=tenant_id,
                patient_id=form.patient_id,
                form_id=form.id,
                actor_type="psychologist",
                actor_id=actor_user_id,
                event_type="assigned",
                payload={
                    "send_mode": "immediate",
                    "title": form.title,
                },
            )
            return form

        if payload.action == "schedule":
            if form.status in {FORM_STATUS_SUBMITTED, FORM_STATUS_REVIEWED}:
                raise FormServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Formulario respondido nao pode ser agendado.",
                )
            if payload.scheduled_send_at is None:
                raise FormServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Agendamento exige scheduled_send_at.",
                )
            scheduled_at = _normalize_datetime(
                payload.scheduled_send_at,
                field_name="scheduled_send_at",
            )
            if form.published_at is None:
                form.published_at = now
            form.status = FORM_STATUS_SCHEDULED
            form.scheduled_send_at = scheduled_at
            return form

        if form.status not in {FORM_STATUS_SUBMITTED, FORM_STATUS_REVIEWED}:
            raise FormServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Revisao exige formulario submetido.",
            )
        form.status = FORM_STATUS_REVIEWED
        form.reviewed_at = now
        form.reviewed_by_user_id = actor_user_id
        form.review_note = _clean_optional(payload.review_note)
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=form.patient_id,
            form_id=form.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type="reviewed",
            payload={"review_note": form.review_note},
        )
        return form

    def dispatch_scheduled_forms(
        self,
        db: Session,
        *,
        tenant_id: UUID | None = None,
        now: datetime | None = None,
    ) -> FormsDispatchRunResult:
        reference = now or _utcnow()
        query: Select[tuple[ClinicalForm]] = select(ClinicalForm).where(
            ClinicalForm.status == FORM_STATUS_SCHEDULED,
            ClinicalForm.scheduled_send_at.is_not(None),
            ClinicalForm.scheduled_send_at <= reference,
        )
        if tenant_id is not None:
            query = query.where(ClinicalForm.tenant_id == tenant_id)
        scheduled = list(db.scalars(query).all())

        dispatched = 0
        dispatched_forms: list[ClinicalForm] = []
        for form in scheduled:
            form.status = FORM_STATUS_ASSIGNED
            form.assigned_at = reference
            append_timeline_event(
                db,
                tenant_id=form.tenant_id,
                patient_id=form.patient_id,
                form_id=form.id,
                actor_type="system",
                event_type="assigned",
                payload={
                    "send_mode": "scheduled",
                    "scheduled_send_at": form.scheduled_send_at.isoformat()
                    if form.scheduled_send_at is not None
                    else None,
                },
            )
            dispatched += 1
            dispatched_forms.append(form)

        return FormsDispatchRunResult(
            processed=len(scheduled),
            dispatched=dispatched,
            dispatched_forms=dispatched_forms,
        )

    def _get_public_anchor_form_by_token(
        self,
        db: Session,
        *,
        patient_access_token: str,
    ) -> ClinicalForm:
        _set_rls_bypass(db)
        anchor = db.scalar(
            select(ClinicalForm).where(
                ClinicalForm.patient_access_token_hash == _hash_token(patient_access_token)
            )
        )
        if anchor is None:
            raise FormServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Link de formulario invalido.",
            )
        if anchor.patient_access_token_expires_at <= _utcnow():
            raise FormServiceError(
                status_code=status.HTTP_410_GONE,
                detail="Link de formulario expirado.",
            )
        _set_current_tenant(db, tenant_id=anchor.tenant_id)
        return anchor

    def list_public_forms_by_token(
        self,
        db: Session,
        *,
        patient_access_token: str,
    ) -> tuple[Patient, list[ClinicalForm]]:
        anchor = self._get_public_anchor_form_by_token(
            db,
            patient_access_token=patient_access_token,
        )
        patient = db.scalar(
            select(Patient).where(
                Patient.id == anchor.patient_id,
                Patient.tenant_id == anchor.tenant_id,
            )
        )
        if patient is None:
            raise FormServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente associado ao formulario nao encontrado.",
            )

        forms = list(
            db.scalars(
                select(ClinicalForm).where(
                    ClinicalForm.tenant_id == anchor.tenant_id,
                    ClinicalForm.patient_id == anchor.patient_id,
                    ClinicalForm.status.in_(FORM_VISIBLE_TO_PATIENT_STATUSES),
                ).order_by(
                    ClinicalForm.assigned_at.desc().nullslast(),
                    ClinicalForm.created_at.desc(),
                )
            ).all()
        )
        return patient, forms

    def apply_public_action(
        self,
        db: Session,
        *,
        patient_access_token: str,
        form_id: UUID,
        payload: ClinicalFormPatientActionRequest,
    ) -> ClinicalForm:
        anchor = self._get_public_anchor_form_by_token(
            db,
            patient_access_token=patient_access_token,
        )
        form = db.scalar(
            select(ClinicalForm).where(
                ClinicalForm.id == form_id,
                ClinicalForm.tenant_id == anchor.tenant_id,
                ClinicalForm.patient_id == anchor.patient_id,
            )
        )
        if form is None:
            raise FormServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Formulario nao encontrado para este paciente.",
            )

        now = _utcnow()
        if payload.action == "open":
            if form.status not in FORM_ACTIVE_PATIENT_STATUSES:
                raise FormServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Formulario nao pode ser aberto neste status.",
                )
            if form.opened_at is None:
                form.opened_at = now
            if form.status == FORM_STATUS_ASSIGNED:
                form.status = FORM_STATUS_OPENED
            append_timeline_event(
                db,
                tenant_id=form.tenant_id,
                patient_id=form.patient_id,
                form_id=form.id,
                actor_type="patient",
                event_type="opened",
                payload={"status_snapshot": form.status},
            )
            return form

        if payload.answers is None:
            raise FormServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Acao exige answers no payload.",
            )
        if form.status in {FORM_STATUS_SUBMITTED, FORM_STATUS_REVIEWED}:
            raise FormServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Formulario ja finalizado.",
            )

        if payload.action == "partial_save":
            normalized_answers = _validate_answers(
                form,
                answers=payload.answers,
                require_complete=False,
            )
            form.response_data = normalized_answers
            form.partial_saved_at = now
            if form.opened_at is None:
                form.opened_at = now
            form.status = FORM_STATUS_PARTIAL_SAVED
            append_timeline_event(
                db,
                tenant_id=form.tenant_id,
                patient_id=form.patient_id,
                form_id=form.id,
                actor_type="patient",
                event_type="partial_saved",
                payload={
                    "answered_count": len(normalized_answers),
                },
            )
            return form

        normalized_answers = _validate_answers(
            form,
            answers=payload.answers,
            require_complete=True,
        )
        form.response_data = normalized_answers
        if form.opened_at is None:
            form.opened_at = now
        form.status = FORM_STATUS_SUBMITTED
        form.submitted_at = now
        append_timeline_event(
            db,
            tenant_id=form.tenant_id,
            patient_id=form.patient_id,
            form_id=form.id,
            actor_type="patient",
            event_type="submitted",
            payload={
                "answered_count": len(normalized_answers),
                "required_count": _required_question_count(form),
            },
        )
        return form

    def list_form_timeline_events(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        form_id: UUID,
        limit: int = 200,
    ) -> list[TimelineEvent]:
        query: Select[tuple[TimelineEvent]] = select(TimelineEvent).where(
            TimelineEvent.tenant_id == tenant_id,
            TimelineEvent.form_id == form_id,
        )
        query = query.order_by(TimelineEvent.created_at.desc()).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())


form_service = FormService()
