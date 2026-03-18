from dataclasses import dataclass
from uuid import UUID

from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PracticeProfile
from app.schemas.practice_profile import PracticeProfileUpsertRequest, ServiceModality, TriageMode


class PracticeProfileValidationError(Exception):
    pass


class PracticeProfileServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class NormalizedPracticeProfileData:
    practice_name: str
    clinical_approach: str
    service_modality: ServiceModality
    in_person_address: str | None
    session_price_cents: int
    currency: str
    late_cancellation_window_hours: int
    late_cancellation_fee_percent: int
    no_show_fee_percent: int
    notification_email_enabled: bool
    notification_whatsapp_enabled: bool
    notification_push_enabled: bool
    session_reminder_hours_before: list[int]
    default_triage_mode: TriageMode
    default_triage_message: str | None


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def normalize_practice_profile_payload(
    payload: PracticeProfileUpsertRequest,
) -> NormalizedPracticeProfileData:
    practice_name = payload.practice_name.strip()
    clinical_approach = payload.clinical_approach.strip()
    in_person_address = _clean_optional(payload.in_person_address)
    triage_message = _clean_optional(payload.default_triage_message)

    reminders = sorted(payload.session_reminder_hours_before, reverse=True)
    if len(reminders) != len(set(reminders)):
        raise PracticeProfileValidationError(
            "session_reminder_hours_before nao pode conter horarios duplicados."
        )
    if any(hour < 1 or hour > 168 for hour in reminders):
        raise PracticeProfileValidationError(
            "session_reminder_hours_before deve conter valores entre 1 e 168."
        )

    if payload.service_modality in {"presential", "hybrid"} and in_person_address is None:
        raise PracticeProfileValidationError(
            "in_person_address e obrigatorio para modalidade presencial ou hibrida."
        )
    if payload.service_modality == "online":
        in_person_address = None

    if payload.default_triage_mode == "custom":
        if triage_message is None or len(triage_message) < 10:
            raise PracticeProfileValidationError(
                "default_triage_message deve ter ao menos 10 caracteres no modo custom."
            )
    if payload.default_triage_mode == "standard":
        triage_message = None

    return NormalizedPracticeProfileData(
        practice_name=practice_name,
        clinical_approach=clinical_approach,
        service_modality=payload.service_modality,
        in_person_address=in_person_address,
        session_price_cents=payload.session_price_cents,
        currency=payload.currency,
        late_cancellation_window_hours=payload.late_cancellation_window_hours,
        late_cancellation_fee_percent=payload.late_cancellation_fee_percent,
        no_show_fee_percent=payload.no_show_fee_percent,
        notification_email_enabled=payload.notification_email_enabled,
        notification_whatsapp_enabled=payload.notification_whatsapp_enabled,
        notification_push_enabled=payload.notification_push_enabled,
        session_reminder_hours_before=reminders,
        default_triage_mode=payload.default_triage_mode,
        default_triage_message=triage_message,
    )


class PracticeProfileService:
    def get_for_tenant(self, db: Session, *, tenant_id: UUID) -> PracticeProfile | None:
        return db.scalar(select(PracticeProfile).where(PracticeProfile.tenant_id == tenant_id))

    def upsert_for_tenant(
        self, db: Session, *, tenant_id: UUID, payload: PracticeProfileUpsertRequest
    ) -> PracticeProfile:
        try:
            normalized = normalize_practice_profile_payload(payload)
        except PracticeProfileValidationError as exc:
            raise PracticeProfileServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc

        profile = self.get_for_tenant(db, tenant_id=tenant_id)
        if profile is None:
            profile = PracticeProfile(
                tenant_id=tenant_id,
                practice_name=normalized.practice_name,
                clinical_approach=normalized.clinical_approach,
                service_modality=normalized.service_modality,
                in_person_address=normalized.in_person_address,
                session_price_cents=normalized.session_price_cents,
                currency=normalized.currency,
                late_cancellation_window_hours=normalized.late_cancellation_window_hours,
                late_cancellation_fee_percent=normalized.late_cancellation_fee_percent,
                no_show_fee_percent=normalized.no_show_fee_percent,
                notification_email_enabled=normalized.notification_email_enabled,
                notification_whatsapp_enabled=normalized.notification_whatsapp_enabled,
                notification_push_enabled=normalized.notification_push_enabled,
                session_reminder_hours_before=normalized.session_reminder_hours_before,
                default_triage_mode=normalized.default_triage_mode,
                default_triage_message=normalized.default_triage_message,
                onboarding_completed=True,
            )
            db.add(profile)
            db.flush()
            return profile

        profile.practice_name = normalized.practice_name
        profile.clinical_approach = normalized.clinical_approach
        profile.service_modality = normalized.service_modality
        profile.in_person_address = normalized.in_person_address
        profile.session_price_cents = normalized.session_price_cents
        profile.currency = normalized.currency
        profile.late_cancellation_window_hours = normalized.late_cancellation_window_hours
        profile.late_cancellation_fee_percent = normalized.late_cancellation_fee_percent
        profile.no_show_fee_percent = normalized.no_show_fee_percent
        profile.notification_email_enabled = normalized.notification_email_enabled
        profile.notification_whatsapp_enabled = normalized.notification_whatsapp_enabled
        profile.notification_push_enabled = normalized.notification_push_enabled
        profile.session_reminder_hours_before = normalized.session_reminder_hours_before
        profile.default_triage_mode = normalized.default_triage_mode
        profile.default_triage_message = normalized.default_triage_message
        profile.onboarding_completed = True

        db.flush()
        return profile


practice_profile_service = PracticeProfileService()
