import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy import Select, select, text
from sqlalchemy.orm import Session

from app.models import Patient, PatientIntake, PracticeProfile, TimelineEvent
from app.schemas.triage import (
    IntakeCustomQuestion,
    IntakeCustomQuestionCreate,
    IntakeInviteCreateRequest,
    IntakeMode,
    IntakePublicSubmitRequest,
    IntakeReviewRequest,
)
from app.services.patient_service import patient_service
from app.services.timeline_service import append_timeline_event

INTAKE_STATUS_PENDING = "pending_submission"
INTAKE_STATUS_SUBMITTED = "submitted"
INTAKE_STATUS_COMPLEMENT_REQUESTED = "complement_requested"
INTAKE_STATUS_APPROVED = "approved"
INTAKE_STATUS_REJECTED = "rejected"
INTAKE_STATUS_EXPIRED = "expired"


class TriageServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class InviteCreationResult:
    intake: PatientIntake
    invite_token: str
    invite_link: str


@dataclass(frozen=True)
class PublicIntakeViewResult:
    intake: PatientIntake
    practice_name: str | None
    custom_questions: list[IntakeCustomQuestion]


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


def _assert_intake_not_expired(db: Session, intake: PatientIntake) -> None:
    if intake.invite_token_expires_at > _utcnow():
        return

    if intake.status not in {
        INTAKE_STATUS_APPROVED,
        INTAKE_STATUS_REJECTED,
        INTAKE_STATUS_EXPIRED,
    }:
        intake.status = INTAKE_STATUS_EXPIRED
        append_timeline_event(
            db,
            tenant_id=intake.tenant_id,
            event_type="intake_expired",
            actor_type="system",
            intake_id=intake.id,
            payload={"mode": intake.mode},
        )

    raise TriageServiceError(
        status_code=status.HTTP_410_GONE,
        detail="Link de convite expirado.",
    )


def _build_custom_questions(
    *,
    mode: IntakeMode,
    custom_questions: list[IntakeCustomQuestionCreate] | None,
) -> list[IntakeCustomQuestion]:
    if mode == "simple_invite":
        return []

    if custom_questions is None or len(custom_questions) == 0:
        raise TriageServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Triagem personalizada exige ao menos uma pergunta.",
        )

    normalized: list[IntakeCustomQuestion] = []
    for index, question in enumerate(custom_questions, start=1):
        prompt = question.prompt.strip()
        if len(prompt) < 3:
            raise TriageServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Perguntas da triagem devem ter ao menos 3 caracteres.",
            )
        normalized.append(
            IntakeCustomQuestion(
                question_id=f"q{index}",
                prompt=prompt,
                required=question.required,
            )
        )

    return normalized


def _normalize_answers_for_intake(
    intake: PatientIntake,
    answers: dict[str, str] | None,
) -> dict[str, str] | None:
    if intake.mode == "simple_invite":
        if answers is None:
            return None
        normalized_simple = {
            key.strip(): value.strip()
            for key, value in answers.items()
            if key.strip() and value.strip()
        }
        return normalized_simple or None

    expected_questions_raw = intake.custom_form or []
    expected_questions = cast(list[dict[str, object]], expected_questions_raw)
    if len(expected_questions) == 0:
        raise TriageServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Triagem personalizada sem formulario configurado.",
        )
    if answers is None:
        raise TriageServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Respostas da triagem sao obrigatorias para este convite.",
        )

    normalized_answers = {
        key.strip(): value.strip()
        for key, value in answers.items()
        if key.strip() and value.strip()
    }

    for question in expected_questions:
        question_id = str(question.get("question_id", "")).strip()
        required = bool(question.get("required", True))
        if required and normalized_answers.get(question_id, "") == "":
            raise TriageServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Pergunta obrigatoria nao respondida: {question_id}.",
            )

    filtered_answers: dict[str, str] = {}
    expected_ids = {
        str(question.get("question_id", "")).strip()
        for question in expected_questions
        if str(question.get("question_id", "")).strip()
    }
    for question_id in expected_ids:
        answer = normalized_answers.get(question_id)
        if answer is not None:
            filtered_answers[question_id] = answer

    return filtered_answers


class TriageService:
    def create_invite(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        creator_user_id: UUID,
        payload: IntakeInviteCreateRequest,
        invite_base_url: str,
    ) -> InviteCreationResult:
        custom_questions = _build_custom_questions(
            mode=payload.mode,
            custom_questions=payload.custom_questions,
        )

        invite_token = secrets.token_urlsafe(32)
        intake = PatientIntake(
            tenant_id=tenant_id,
            created_by_user_id=creator_user_id,
            mode=payload.mode,
            status=INTAKE_STATUS_PENDING,
            invite_token_hash=_hash_token(invite_token),
            invite_token_expires_at=_utcnow() + timedelta(hours=payload.expires_in_hours),
            invite_message=_clean_optional(payload.invite_message),
            custom_form=[question.model_dump(mode="json") for question in custom_questions]
            if custom_questions
            else None,
        )
        db.add(intake)
        db.flush()

        invite_link = f"{invite_base_url.rstrip('/')}?token={invite_token}"
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            intake_id=intake.id,
            actor_type="psychologist",
            actor_id=creator_user_id,
            event_type="intake_invite_created",
            payload={
                "mode": payload.mode,
                "invite_expires_at": intake.invite_token_expires_at.isoformat(),
                "invite_link": invite_link,
            },
        )

        return InviteCreationResult(
            intake=intake,
            invite_token=invite_token,
            invite_link=invite_link,
        )

    def _get_public_intake_by_token(self, db: Session, *, invite_token: str) -> PatientIntake:
        _set_rls_bypass(db)
        intake = db.scalar(
            select(PatientIntake).where(
                PatientIntake.invite_token_hash == _hash_token(invite_token)
            )
        )
        if intake is None:
            raise TriageServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Convite invalido.",
            )
        _assert_intake_not_expired(db, intake)
        return intake

    def get_public_intake(self, db: Session, *, invite_token: str) -> PublicIntakeViewResult:
        intake = self._get_public_intake_by_token(db, invite_token=invite_token)

        if intake.opened_at is None:
            intake.opened_at = _utcnow()
            append_timeline_event(
                db,
                tenant_id=intake.tenant_id,
                intake_id=intake.id,
                actor_type="patient",
                event_type="intake_link_opened",
                payload={"mode": intake.mode},
            )

        practice_profile = db.scalar(
            select(PracticeProfile).where(PracticeProfile.tenant_id == intake.tenant_id)
        )

        custom_form_raw = intake.custom_form or []
        custom_questions = [
            IntakeCustomQuestion.model_validate(question)
            for question in cast(list[dict[str, object]], custom_form_raw)
        ]

        return PublicIntakeViewResult(
            intake=intake,
            practice_name=practice_profile.practice_name if practice_profile is not None else None,
            custom_questions=custom_questions,
        )

    def submit_public_intake(
        self,
        db: Session,
        *,
        invite_token: str,
        payload: IntakePublicSubmitRequest,
    ) -> PatientIntake:
        intake = self._get_public_intake_by_token(db, invite_token=invite_token)
        if intake.status not in {
            INTAKE_STATUS_PENDING,
            INTAKE_STATUS_COMPLEMENT_REQUESTED,
        }:
            raise TriageServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Convite nao permite nova submissao neste estado.",
            )

        triage_answers = _normalize_answers_for_intake(intake, payload.triage_answers)

        intake.patient_full_name = payload.patient_full_name.strip()
        patient_email = payload.patient_email.lower() if payload.patient_email else None
        intake.patient_email = _clean_optional(patient_email)
        intake.patient_phone = _clean_optional(payload.patient_phone)
        intake.consent_terms_accepted = True
        intake.consent_privacy_accepted = True
        intake.triage_answers = triage_answers
        intake.submitted_at = _utcnow()
        intake.status = INTAKE_STATUS_SUBMITTED

        append_timeline_event(
            db,
            tenant_id=intake.tenant_id,
            intake_id=intake.id,
            actor_type="patient",
            event_type="intake_submitted",
            payload={
                "mode": intake.mode,
                "has_triage_answers": triage_answers is not None and len(triage_answers) > 0,
            },
        )
        return intake

    def list_queue(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        statuses: set[str] | None = None,
    ) -> list[PatientIntake]:
        query: Select[tuple[PatientIntake]] = select(PatientIntake).where(
            PatientIntake.tenant_id == tenant_id
        )
        if statuses is not None and len(statuses) > 0:
            query = query.where(PatientIntake.status.in_(statuses))
        query = query.order_by(
            PatientIntake.submitted_at.desc().nullslast(),
            PatientIntake.created_at.desc(),
        )
        return list(db.scalars(query).all())

    def get_intake_for_tenant(
        self, db: Session, *, tenant_id: UUID, intake_id: UUID
    ) -> PatientIntake | None:
        return db.scalar(
            select(PatientIntake).where(
                PatientIntake.tenant_id == tenant_id,
                PatientIntake.id == intake_id,
            )
        )

    def review_intake(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        reviewer_user_id: UUID,
        intake_id: UUID,
        payload: IntakeReviewRequest,
    ) -> PatientIntake:
        intake = self.get_intake_for_tenant(db, tenant_id=tenant_id, intake_id=intake_id)
        if intake is None:
            raise TriageServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Triagem nao encontrada.",
            )

        _assert_intake_not_expired(db, intake)
        now = _utcnow()
        note = _clean_optional(payload.note)

        if payload.action == "approve":
            if intake.status not in {INTAKE_STATUS_SUBMITTED, INTAKE_STATUS_COMPLEMENT_REQUESTED}:
                raise TriageServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Somente triagens submetidas podem ser aprovadas.",
                )
            if intake.patient_full_name is None:
                raise TriageServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Triagem sem dados minimos do paciente.",
                )

            patient = Patient(
                tenant_id=tenant_id,
                profile_source="intake",
                full_name=intake.patient_full_name,
                email=intake.patient_email,
                phone=_clean_optional(intake.patient_phone),
                preferred_contact_channel=(
                    "whatsapp"
                    if intake.patient_phone
                    else "email"
                    if intake.patient_email
                    else "phone"
                ),
            )
            db.add(patient)
            db.flush()
            patient_service.record_creation_from_intake(
                db,
                tenant_id=tenant_id,
                patient=patient,
                actor_user_id=reviewer_user_id,
                intake_id=intake.id,
            )

            intake.status = INTAKE_STATUS_APPROVED
            intake.reviewed_by_user_id = reviewer_user_id
            intake.reviewed_at = now
            intake.activated_patient_id = patient.id
            intake.activated_at = now
            intake.review_note = note
            intake.complement_request_note = None

            append_timeline_event(
                db,
                tenant_id=tenant_id,
                intake_id=intake.id,
                actor_type="psychologist",
                actor_id=reviewer_user_id,
                event_type="intake_approved",
                payload={"note": note} if note else {},
            )
            append_timeline_event(
                db,
                tenant_id=tenant_id,
                intake_id=intake.id,
                patient_id=patient.id,
                actor_type="system",
                event_type="patient_activated",
                payload={"patient_id": str(patient.id)},
            )
            return intake

        if payload.action == "reject":
            if intake.status not in {INTAKE_STATUS_SUBMITTED, INTAKE_STATUS_COMPLEMENT_REQUESTED}:
                raise TriageServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Somente triagens submetidas podem ser rejeitadas.",
                )
            if note is None:
                raise TriageServiceError(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Informe o motivo da rejeicao.",
                )

            intake.status = INTAKE_STATUS_REJECTED
            intake.reviewed_by_user_id = reviewer_user_id
            intake.reviewed_at = now
            intake.review_note = note

            append_timeline_event(
                db,
                tenant_id=tenant_id,
                intake_id=intake.id,
                actor_type="psychologist",
                actor_id=reviewer_user_id,
                event_type="intake_rejected",
                payload={"note": note},
            )
            return intake

        if intake.status != INTAKE_STATUS_SUBMITTED:
            raise TriageServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Complemento so pode ser solicitado para triagens submetidas.",
            )
        if note is None:
            raise TriageServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe o que deve ser complementado.",
            )

        intake.status = INTAKE_STATUS_COMPLEMENT_REQUESTED
        intake.reviewed_by_user_id = reviewer_user_id
        intake.reviewed_at = now
        intake.complement_request_note = note

        append_timeline_event(
            db,
            tenant_id=tenant_id,
            intake_id=intake.id,
            actor_type="psychologist",
            actor_id=reviewer_user_id,
            event_type="intake_complement_requested",
            payload={"note": note},
        )
        return intake

    def list_timeline_events(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        intake_id: UUID | None = None,
        limit: int = 200,
    ) -> list[TimelineEvent]:
        query: Select[tuple[TimelineEvent]] = select(TimelineEvent).where(
            TimelineEvent.tenant_id == tenant_id
        )
        if intake_id is not None:
            query = query.where(TimelineEvent.intake_id == intake_id)

        query = query.order_by(TimelineEvent.created_at.desc()).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())


triage_service = TriageService()
