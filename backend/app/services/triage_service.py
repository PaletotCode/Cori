import hashlib
import hmac
import re
import secrets
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy import Select, func, select, text
from sqlalchemy.orm import Session

from app.models import Patient, PatientIntake, PracticeProfile, TimelineEvent, User
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
ACCESS_CODE_MAX_ATTEMPTS = 5
ACCESS_CODE_LOCK_WINDOW = timedelta(minutes=15)
ACCESS_CODE_REGEX = re.compile(r"^([A-Z0-9]{7})-([0-9]{4})-([0-9]{2})$")
PATIENT_PORTAL_ACCESS_TTL = timedelta(days=30)


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
    access_code: str


@dataclass(frozen=True)
class PublicIntakeViewResult:
    intake: PatientIntake
    practice_name: str | None
    custom_questions: list[IntakeCustomQuestion]


@dataclass(frozen=True)
class AccessCodeValidationResult:
    valid: bool
    message: str
    intake: PatientIntake | None


@dataclass(frozen=True)
class AccessCodeActivationResult:
    access_granted: bool
    message: str
    intake: PatientIntake | None
    patient: Patient | None
    patient_access_token: str | None
    patient_access_expires_at: datetime | None


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _normalize_profile_media_url(value: str | None) -> str | None:
    cleaned = _clean_optional(value)
    if cleaned is None:
        return None
    if cleaned.startswith("https://") or cleaned.startswith("http://"):
        return cleaned
    raise TriageServiceError(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Links de perfil e banner devem usar URL http:// ou https://.",
    )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalize_access_code_alias(value: str | None) -> str:
    cleaned = _clean_optional(value)
    if cleaned is None:
        return "CORI"

    normalized = unicodedata.normalize("NFD", cleaned)
    normalized = "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    )
    letters = "".join(char for char in normalized.upper() if char.isalnum())
    if len(letters) == 0:
        return "CORI"
    return letters[:12]


def _build_access_code_checksum(key: str, secret: str) -> str:
    checksum_base = f"{key}{secret}"
    total = sum(ord(char) for char in checksum_base)
    return f"{total % 97:02d}"


def _build_access_code(*, alias: str | None) -> tuple[str, str]:
    normalized_alias = _normalize_access_code_alias(alias)
    alias_prefix = (normalized_alias + "COR")[:3]
    random_suffix = secrets.token_hex(2).upper()
    key = f"{alias_prefix}{random_suffix}"
    secret = f"{secrets.randbelow(10_000):04d}"
    checksum = _build_access_code_checksum(key, secret)
    return key, f"{key}-{secret}-{checksum}"


def _parse_access_code(value: str) -> tuple[str, str, str] | None:
    normalized = value.strip().upper()
    match = ACCESS_CODE_REGEX.match(normalized)
    if match is None:
        return None

    key, secret, checksum = match.groups()
    expected_checksum = _build_access_code_checksum(key, secret)
    if checksum != expected_checksum:
        return None

    return key, secret, checksum


def _set_rls_bypass(db: Session) -> None:
    db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))


def _set_current_tenant(db: Session, *, tenant_id: UUID) -> None:
    db.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant_id)},
    )


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


def _mark_intake_expired_if_needed(db: Session, intake: PatientIntake) -> None:
    if intake.invite_token_expires_at > _utcnow():
        return
    if intake.status in {
        INTAKE_STATUS_APPROVED,
        INTAKE_STATUS_REJECTED,
        INTAKE_STATUS_EXPIRED,
    }:
        return
    intake.status = INTAKE_STATUS_EXPIRED
    append_timeline_event(
        db,
        tenant_id=intake.tenant_id,
        event_type="intake_expired",
        actor_type="system",
        intake_id=intake.id,
        payload={"mode": intake.mode},
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
    def _assign_new_access_code(
        self,
        db: Session,
        *,
        intake: PatientIntake,
        alias: str | None,
    ) -> str:
        max_attempts = 16
        for _ in range(max_attempts):
            key, access_code = _build_access_code(alias=alias)
            existing_key = db.scalar(
                select(PatientIntake.id).where(PatientIntake.access_code_key == key)
            )
            if existing_key is not None and existing_key != intake.id:
                continue
            intake.access_code_key = key
            intake.access_code_hash = _hash_token(access_code)
            intake.access_code_expires_at = intake.invite_token_expires_at
            intake.access_code_attempts = 0
            intake.access_code_locked_until = None
            intake.access_code_last_attempt_at = None
            db.flush()
            return access_code

        raise TriageServiceError(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Nao foi possivel gerar novo codigo de acesso. Tente novamente.",
        )

    def _issue_patient_portal_access_token(
        self,
        db: Session,
        *,
        patient: Patient,
    ) -> tuple[str, datetime]:
        token = f"pt.{patient.tenant_id}.{secrets.token_urlsafe(32)}"
        expires_at = _utcnow() + PATIENT_PORTAL_ACCESS_TTL
        patient.portal_access_token_hash = _hash_token(token)
        patient.portal_access_token_expires_at = expires_at
        db.flush()
        return token, expires_at

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

        _set_rls_bypass(db)
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
        access_code = self._assign_new_access_code(
            db,
            intake=intake,
            alias=payload.access_code_alias,
        )

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
                "access_code_expires_at": (
                    intake.access_code_expires_at.isoformat()
                    if intake.access_code_expires_at is not None
                    else None
                ),
            },
        )

        return InviteCreationResult(
            intake=intake,
            invite_token=invite_token,
            invite_link=invite_link,
            access_code=access_code,
        )

    def _get_public_intake_by_token(
        self,
        db: Session,
        *,
        invite_token: str,
        for_update: bool = False,
    ) -> PatientIntake:
        _set_rls_bypass(db)
        query = select(PatientIntake).where(
            PatientIntake.invite_token_hash == _hash_token(invite_token)
        )
        if for_update:
            query = query.with_for_update()
        intake = db.scalar(query)
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

    def _resolve_authenticated_patient_intake(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
        for_update: bool,
    ) -> PatientIntake:
        _set_rls_bypass(db)
        user = db.scalar(
            select(User).where(
                User.id == user_id,
                User.tenant_id == tenant_id,
                User.is_active.is_(True),
            )
        )
        if user is None:
            raise TriageServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sessao do paciente invalida para triagem.",
            )

        query = (
            select(PatientIntake)
            .where(
                PatientIntake.tenant_id == tenant_id,
                PatientIntake.patient_auth_user_id == user_id,
            )
            .order_by(PatientIntake.updated_at.desc(), PatientIntake.created_at.desc())
        )
        if for_update:
            query = query.with_for_update()
        intake = db.scalar(query)

        if intake is None and user.email is not None:
            fallback_query = (
                select(PatientIntake)
                .where(
                    PatientIntake.tenant_id == tenant_id,
                    func.lower(PatientIntake.patient_oauth_email) == user.email.lower(),
                )
                .order_by(PatientIntake.updated_at.desc(), PatientIntake.created_at.desc())
            )
            if for_update:
                fallback_query = fallback_query.with_for_update()
            intake = db.scalar(fallback_query)
            if intake is not None and intake.patient_auth_user_id is None:
                intake.patient_auth_user_id = user_id

        if intake is None:
            raise TriageServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nenhuma triagem vinculada ao paciente foi encontrada.",
            )

        return intake

    def get_authenticated_patient_intake(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
    ) -> PatientIntake:
        intake = self._resolve_authenticated_patient_intake(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            for_update=True,
        )
        _mark_intake_expired_if_needed(db, intake)
        return intake

    def _apply_submit_payload_to_intake(
        self,
        db: Session,
        *,
        intake: PatientIntake,
        payload: IntakePublicSubmitRequest,
    ) -> PatientIntake:
        if intake.status not in {
            INTAKE_STATUS_PENDING,
            INTAKE_STATUS_COMPLEMENT_REQUESTED,
        }:
            raise TriageServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Triagem nao permite nova submissao neste estado.",
            )

        triage_answers = _normalize_answers_for_intake(intake, payload.triage_answers)

        intake.patient_full_name = payload.patient_full_name.strip()
        intake.patient_preferred_name = _clean_optional(payload.patient_preferred_name)
        patient_email = payload.patient_email.lower() if payload.patient_email else None
        intake.patient_email = _clean_optional(patient_email)
        intake.patient_phone = _clean_optional(payload.patient_phone)
        intake.patient_birth_date = payload.patient_birth_date
        intake.patient_pronouns = _clean_optional(payload.patient_pronouns)
        intake.patient_emergency_contact_name = _clean_optional(payload.patient_emergency_contact_name)
        intake.patient_emergency_contact_phone = _clean_optional(payload.patient_emergency_contact_phone)
        intake.patient_communication_notes = _clean_optional(payload.patient_communication_notes)
        intake.patient_profile_photo_url = _normalize_profile_media_url(payload.patient_profile_photo_url)
        intake.patient_profile_banner_url = _normalize_profile_media_url(payload.patient_profile_banner_url)
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
            actor_id=intake.patient_auth_user_id,
            event_type="intake_submitted",
            payload={
                "mode": intake.mode,
                "has_triage_answers": triage_answers is not None and len(triage_answers) > 0,
            },
        )
        return intake

    def submit_public_intake(
        self,
        db: Session,
        *,
        invite_token: str,
        payload: IntakePublicSubmitRequest,
    ) -> PatientIntake:
        intake = self._get_public_intake_by_token(
            db,
            invite_token=invite_token,
            for_update=True,
        )
        if intake.status not in {
            INTAKE_STATUS_PENDING,
            INTAKE_STATUS_COMPLEMENT_REQUESTED,
        }:
            raise TriageServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Convite nao permite nova submissao neste estado.",
            )
        return self._apply_submit_payload_to_intake(
            db,
            intake=intake,
            payload=payload,
        )

    def submit_authenticated_patient_intake(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
        payload: IntakePublicSubmitRequest,
    ) -> PatientIntake:
        intake = self._resolve_authenticated_patient_intake(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            for_update=True,
        )
        _assert_intake_not_expired(db, intake)
        return self._apply_submit_payload_to_intake(
            db,
            intake=intake,
            payload=payload,
        )

    def rotate_access_code(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        intake_id: UUID,
        alias: str | None,
    ) -> tuple[PatientIntake, str]:
        _set_rls_bypass(db)
        intake = db.scalar(
            select(PatientIntake)
            .where(
                PatientIntake.tenant_id == tenant_id,
                PatientIntake.id == intake_id,
            )
            .with_for_update()
        )
        if intake is None:
            raise TriageServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Triagem nao encontrada.",
            )

        if intake.status in {
            INTAKE_STATUS_APPROVED,
            INTAKE_STATUS_REJECTED,
            INTAKE_STATUS_EXPIRED,
        }:
            raise TriageServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Codigo nao pode ser renovado para triagem finalizada.",
            )

        _assert_intake_not_expired(db, intake)
        access_code = self._assign_new_access_code(db, intake=intake, alias=alias)
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            intake_id=intake.id,
            actor_type="psychologist",
            actor_id=actor_user_id,
            event_type="intake_access_code_rotated",
            payload={
                "access_code_expires_at": (
                    intake.access_code_expires_at.isoformat()
                    if intake.access_code_expires_at is not None
                    else None
                ),
            },
        )
        return intake, access_code

    def validate_access_code(
        self,
        db: Session,
        *,
        code: str,
    ) -> AccessCodeValidationResult:
        parsed = _parse_access_code(code)
        if parsed is None:
            return AccessCodeValidationResult(
                valid=False,
                message="Codigo invalido ou expirado.",
                intake=None,
            )

        key, _, _ = parsed
        _set_rls_bypass(db)
        intake = db.scalar(
            select(PatientIntake).where(PatientIntake.access_code_key == key).with_for_update()
        )
        if intake is None or intake.access_code_hash is None:
            return AccessCodeValidationResult(
                valid=False,
                message="Codigo invalido ou expirado.",
                intake=None,
            )

        now = _utcnow()
        if intake.access_code_locked_until is not None and intake.access_code_locked_until > now:
            return AccessCodeValidationResult(
                valid=False,
                message="Muitas tentativas. Tente novamente em alguns minutos.",
                intake=None,
            )

        try:
            _assert_intake_not_expired(db, intake)
        except TriageServiceError:
            return AccessCodeValidationResult(
                valid=False,
                message="Codigo invalido ou expirado.",
                intake=None,
            )

        if intake.access_code_expires_at is not None and intake.access_code_expires_at <= now:
            return AccessCodeValidationResult(
                valid=False,
                message="Codigo invalido ou expirado.",
                intake=None,
            )

        normalized_code = code.strip().upper()
        code_hash = _hash_token(normalized_code)
        if not hmac.compare_digest(code_hash, intake.access_code_hash):
            intake.access_code_attempts = max(0, intake.access_code_attempts) + 1
            intake.access_code_last_attempt_at = now
            if intake.access_code_attempts >= ACCESS_CODE_MAX_ATTEMPTS:
                intake.access_code_locked_until = now + ACCESS_CODE_LOCK_WINDOW

            return AccessCodeValidationResult(
                valid=False,
                message=(
                    "Muitas tentativas. Tente novamente em alguns minutos."
                    if intake.access_code_locked_until is not None
                    else "Codigo invalido ou expirado."
                ),
                intake=None,
            )

        if intake.status in {INTAKE_STATUS_APPROVED, INTAKE_STATUS_REJECTED, INTAKE_STATUS_EXPIRED}:
            return AccessCodeValidationResult(
                valid=False,
                message="Este codigo nao esta mais disponivel.",
                intake=None,
            )

        intake.access_code_attempts = 0
        intake.access_code_locked_until = None
        intake.access_code_last_attempt_at = now
        return AccessCodeValidationResult(
            valid=True,
            message="Codigo validado. Voce ja pode continuar o primeiro acesso.",
            intake=intake,
        )

    def activate_patient_access_by_code(
        self,
        db: Session,
        *,
        code: str,
    ) -> AccessCodeActivationResult:
        parsed = _parse_access_code(code)
        if parsed is None:
            return AccessCodeActivationResult(
                access_granted=False,
                message="Codigo invalido ou expirado.",
                intake=None,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        key, _, _ = parsed
        _set_rls_bypass(db)
        intake = db.scalar(
            select(PatientIntake).where(PatientIntake.access_code_key == key).with_for_update()
        )
        if intake is None or intake.access_code_hash is None:
            return AccessCodeActivationResult(
                access_granted=False,
                message="Codigo invalido ou expirado.",
                intake=None,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        now = _utcnow()
        if intake.access_code_locked_until is not None and intake.access_code_locked_until > now:
            return AccessCodeActivationResult(
                access_granted=False,
                message="Muitas tentativas. Tente novamente em alguns minutos.",
                intake=None,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        try:
            _assert_intake_not_expired(db, intake)
        except TriageServiceError:
            return AccessCodeActivationResult(
                access_granted=False,
                message="Codigo invalido ou expirado.",
                intake=None,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        if intake.access_code_expires_at is not None and intake.access_code_expires_at <= now:
            return AccessCodeActivationResult(
                access_granted=False,
                message="Codigo invalido ou expirado.",
                intake=None,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        normalized_code = code.strip().upper()
        code_hash = _hash_token(normalized_code)
        if not hmac.compare_digest(code_hash, intake.access_code_hash):
            intake.access_code_attempts = max(0, intake.access_code_attempts) + 1
            intake.access_code_last_attempt_at = now
            if intake.access_code_attempts >= ACCESS_CODE_MAX_ATTEMPTS:
                intake.access_code_locked_until = now + ACCESS_CODE_LOCK_WINDOW

            return AccessCodeActivationResult(
                access_granted=False,
                message=(
                    "Muitas tentativas. Tente novamente em alguns minutos."
                    if intake.access_code_locked_until is not None
                    else "Codigo invalido ou expirado."
                ),
                intake=None,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        intake.access_code_attempts = 0
        intake.access_code_locked_until = None
        intake.access_code_last_attempt_at = now

        if intake.status == INTAKE_STATUS_PENDING:
            return AccessCodeActivationResult(
                access_granted=False,
                message=(
                    "Ainda falta enviar a triagem inicial. "
                    "Finalize seus dados para prosseguir."
                ),
                intake=intake,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        if intake.status in {INTAKE_STATUS_SUBMITTED, INTAKE_STATUS_COMPLEMENT_REQUESTED}:
            return AccessCodeActivationResult(
                access_granted=False,
                message=(
                    "Triagem enviada com sucesso. "
                    "Agora aguarde a aprovacao do seu psicologo."
                ),
                intake=intake,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        if intake.status == INTAKE_STATUS_REJECTED:
            return AccessCodeActivationResult(
                access_granted=False,
                message=(
                    "Sua triagem nao foi aprovada neste momento. "
                    "Fale com seu psicologo para orientacoes."
                ),
                intake=intake,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        if intake.status != INTAKE_STATUS_APPROVED or intake.activated_patient_id is None:
            return AccessCodeActivationResult(
                access_granted=False,
                message="Acesso ainda nao liberado para este codigo.",
                intake=intake,
                patient=None,
                patient_access_token=None,
                patient_access_expires_at=None,
            )

        _set_current_tenant(db, tenant_id=intake.tenant_id)
        patient = db.scalar(
            select(Patient)
            .where(
                Patient.id == intake.activated_patient_id,
                Patient.tenant_id == intake.tenant_id,
            )
            .with_for_update()
        )
        if patient is None:
            raise TriageServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Paciente aprovado nao encontrado para liberacao de acesso.",
            )

        patient_access_token, patient_access_expires_at = self._issue_patient_portal_access_token(
            db,
            patient=patient,
        )
        append_timeline_event(
            db,
            tenant_id=intake.tenant_id,
            intake_id=intake.id,
            patient_id=patient.id,
            actor_type="system",
            event_type="patient_portal_access_issued",
            payload={
                "patient_id": str(patient.id),
                "expires_at": patient_access_expires_at.isoformat(),
            },
        )

        return AccessCodeActivationResult(
            access_granted=True,
            message="Acesso liberado. Voce ja pode entrar no aplicativo.",
            intake=intake,
            patient=patient,
            patient_access_token=patient_access_token,
            patient_access_expires_at=patient_access_expires_at,
        )

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

    def queue_summary(
        self,
        db: Session,
        *,
        tenant_id: UUID,
    ) -> dict[str, int]:
        rows = list(
            db.execute(
                select(PatientIntake.status, func.count(PatientIntake.id))
                .where(PatientIntake.tenant_id == tenant_id)
                .group_by(PatientIntake.status)
            )
        )
        counts = {str(status): int(total) for status, total in rows}
        submitted = counts.get(INTAKE_STATUS_SUBMITTED, 0)
        return {
            "total": sum(counts.values()),
            "actionable": submitted,
            INTAKE_STATUS_PENDING: counts.get(INTAKE_STATUS_PENDING, 0),
            INTAKE_STATUS_SUBMITTED: submitted,
            INTAKE_STATUS_COMPLEMENT_REQUESTED: counts.get(INTAKE_STATUS_COMPLEMENT_REQUESTED, 0),
            INTAKE_STATUS_APPROVED: counts.get(INTAKE_STATUS_APPROVED, 0),
            INTAKE_STATUS_REJECTED: counts.get(INTAKE_STATUS_REJECTED, 0),
            INTAKE_STATUS_EXPIRED: counts.get(INTAKE_STATUS_EXPIRED, 0),
        }

    def get_intake_for_tenant(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        intake_id: UUID,
        for_update: bool = False,
    ) -> PatientIntake | None:
        query = select(PatientIntake).where(
            PatientIntake.tenant_id == tenant_id,
            PatientIntake.id == intake_id,
        )
        if for_update:
            query = query.with_for_update()
        return db.scalar(query)

    def review_intake(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        reviewer_user_id: UUID,
        intake_id: UUID,
        payload: IntakeReviewRequest,
    ) -> PatientIntake:
        intake = self.get_intake_for_tenant(
            db,
            tenant_id=tenant_id,
            intake_id=intake_id,
            for_update=True,
        )
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
                preferred_name=_clean_optional(intake.patient_preferred_name),
                email=intake.patient_email,
                phone=_clean_optional(intake.patient_phone),
                birth_date=intake.patient_birth_date,
                pronouns=_clean_optional(intake.patient_pronouns),
                emergency_contact_name=_clean_optional(intake.patient_emergency_contact_name),
                emergency_contact_phone=_clean_optional(intake.patient_emergency_contact_phone),
                preferred_contact_channel=(
                    "whatsapp"
                    if intake.patient_phone
                    else "email"
                    if intake.patient_email
                    else "phone"
                ),
                communication_notes=_clean_optional(intake.patient_communication_notes),
                profile_photo_url=_clean_optional(intake.patient_profile_photo_url),
                profile_banner_url=_clean_optional(intake.patient_profile_banner_url),
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
