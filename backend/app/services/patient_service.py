from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import status
from sqlalchemy import Select, asc, desc, or_, select
from sqlalchemy.orm import Session

from app.models import Patient, PatientProfileChange, TimelineEvent
from app.schemas.patient import (
    PatientContactChannel,
    PatientContactPeriod,
    PatientCreateRequest,
    PatientSortBy,
    PatientUpdateRequest,
    SortOrder,
)
from app.services.timeline_service import append_timeline_event


class PatientServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class PatientProfileValidationError(Exception):
    pass


@dataclass(frozen=True)
class NormalizedPatientProfile:
    full_name: str
    preferred_name: str | None
    email: str | None
    phone: str | None
    birth_date: date | None
    pronouns: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    preferred_contact_channel: PatientContactChannel
    preferred_contact_period: PatientContactPeriod | None
    communication_notes: str | None


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _normalize_full_name(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) < 3:
        raise PatientProfileValidationError(
            "Nome completo do paciente deve ter ao menos 3 caracteres."
        )
    return cleaned


def _normalize_email(value: str | None) -> str | None:
    cleaned = _clean_optional(value)
    if cleaned is None:
        return None

    normalized = cleaned.lower()
    if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
        raise PatientProfileValidationError("Email do paciente invalido.")
    return normalized


def _normalize_phone(value: str | None, *, field_name: str) -> str | None:
    cleaned = _clean_optional(value)
    if cleaned is None:
        return None

    digits = "".join(char for char in cleaned if char.isdigit())
    if len(digits) < 8 or len(digits) > 15:
        raise PatientProfileValidationError(
            f"{field_name} deve conter entre 8 e 15 digitos."
        )
    return f"+{digits}"


def extract_phone_digits(value: str | None) -> str:
    if value is None:
        return ""
    return "".join(char for char in value if char.isdigit())


def is_valid_whatsapp_number(value: str | None) -> bool:
    digits = extract_phone_digits(value)
    return 10 <= len(digits) <= 15


def normalize_patient_profile_payload(
    payload: PatientCreateRequest | PatientUpdateRequest,
) -> NormalizedPatientProfile:
    if payload.birth_date is not None and payload.birth_date > date.today():
        raise PatientProfileValidationError("Data de nascimento nao pode estar no futuro.")

    return NormalizedPatientProfile(
        full_name=_normalize_full_name(payload.full_name),
        preferred_name=_clean_optional(payload.preferred_name),
        email=_normalize_email(payload.email),
        phone=_normalize_phone(payload.phone, field_name="Telefone do paciente"),
        birth_date=payload.birth_date,
        pronouns=_clean_optional(payload.pronouns),
        emergency_contact_name=_clean_optional(payload.emergency_contact_name),
        emergency_contact_phone=_normalize_phone(
            payload.emergency_contact_phone,
            field_name="Telefone do contato de emergencia",
        ),
        preferred_contact_channel=payload.preferred_contact_channel,
        preferred_contact_period=payload.preferred_contact_period,
        communication_notes=_clean_optional(payload.communication_notes),
    )


def _patient_snapshot(patient: Patient) -> dict[str, object]:
    return {
        "full_name": patient.full_name,
        "preferred_name": patient.preferred_name,
        "email": patient.email,
        "phone": patient.phone,
        "birth_date": patient.birth_date.isoformat() if patient.birth_date else None,
        "pronouns": patient.pronouns,
        "emergency_contact_name": patient.emergency_contact_name,
        "emergency_contact_phone": patient.emergency_contact_phone,
        "preferred_contact_channel": patient.preferred_contact_channel,
        "preferred_contact_period": patient.preferred_contact_period,
        "communication_notes": patient.communication_notes,
        "profile_source": patient.profile_source,
    }


def _diff_changed_fields(
    previous_data: dict[str, object] | None,
    new_data: dict[str, object] | None,
) -> list[str]:
    previous = previous_data or {}
    current = new_data or {}
    keys = set(previous.keys()) | set(current.keys())
    changed = [key for key in keys if previous.get(key) != current.get(key)]
    return sorted(changed)


def _append_profile_change(
    db: Session,
    *,
    tenant_id: UUID,
    patient_id: UUID,
    changed_by_user_id: UUID | None,
    change_type: str,
    changed_fields: list[str],
    previous_data: dict[str, object] | None,
    new_data: dict[str, object] | None,
    reason: str | None,
) -> PatientProfileChange:
    change = PatientProfileChange(
        tenant_id=tenant_id,
        patient_id=patient_id,
        changed_by_user_id=changed_by_user_id,
        change_type=change_type,
        changed_fields=changed_fields,
        previous_data=previous_data,
        new_data=new_data,
        reason=reason,
    )
    db.add(change)
    db.flush()
    return change


def _apply_normalized_profile(patient: Patient, normalized: NormalizedPatientProfile) -> None:
    patient.full_name = normalized.full_name
    patient.preferred_name = normalized.preferred_name
    patient.email = normalized.email
    patient.phone = normalized.phone
    patient.birth_date = normalized.birth_date
    patient.pronouns = normalized.pronouns
    patient.emergency_contact_name = normalized.emergency_contact_name
    patient.emergency_contact_phone = normalized.emergency_contact_phone
    patient.preferred_contact_channel = normalized.preferred_contact_channel
    patient.preferred_contact_period = normalized.preferred_contact_period
    patient.communication_notes = normalized.communication_notes


class PatientService:
    def get_patient_for_tenant(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        include_archived: bool = False,
    ) -> Patient | None:
        query: Select[tuple[Patient]] = select(Patient).where(
            Patient.tenant_id == tenant_id,
            Patient.id == patient_id,
        )
        if not include_archived:
            query = query.where(Patient.archived_at.is_(None))
        return db.scalar(query)

    def create_patient(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        payload: PatientCreateRequest,
    ) -> Patient:
        try:
            normalized = normalize_patient_profile_payload(payload)
        except PatientProfileValidationError as exc:
            raise PatientServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc

        patient = Patient(
            tenant_id=tenant_id,
            profile_source="manual",
            full_name=normalized.full_name,
            preferred_name=normalized.preferred_name,
            email=normalized.email,
            phone=normalized.phone,
            birth_date=normalized.birth_date,
            pronouns=normalized.pronouns,
            emergency_contact_name=normalized.emergency_contact_name,
            emergency_contact_phone=normalized.emergency_contact_phone,
            preferred_contact_channel=normalized.preferred_contact_channel,
            preferred_contact_period=normalized.preferred_contact_period,
            communication_notes=normalized.communication_notes,
        )
        db.add(patient)
        db.flush()

        new_data = _patient_snapshot(patient)
        _append_profile_change(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            changed_by_user_id=actor_user_id,
            change_type="created",
            changed_fields=sorted(new_data.keys()),
            previous_data=None,
            new_data=new_data,
            reason="Cadastro inicial manual.",
        )
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            event_type="patient_profile_created",
            actor_type="psychologist",
            actor_id=actor_user_id,
            payload={
                "profile_source": patient.profile_source,
                "changed_fields": sorted(new_data.keys()),
            },
        )
        return patient

    def list_patients(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        search: str | None = None,
        preferred_contact_channel: PatientContactChannel | None = None,
        has_whatsapp: bool | None = None,
        sort_by: PatientSortBy = "updated_at",
        sort_order: SortOrder = "desc",
    ) -> list[Patient]:
        query: Select[tuple[Patient]] = select(Patient).where(
            Patient.tenant_id == tenant_id,
            Patient.archived_at.is_(None),
        )

        if search is not None and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    Patient.full_name.ilike(term),
                    Patient.preferred_name.ilike(term),
                    Patient.email.ilike(term),
                    Patient.phone.ilike(term),
                )
            )

        if preferred_contact_channel is not None:
            query = query.where(Patient.preferred_contact_channel == preferred_contact_channel)

        sort_column = {
            "full_name": Patient.full_name,
            "created_at": Patient.created_at,
            "updated_at": Patient.updated_at,
        }[sort_by]
        direction = asc if sort_order == "asc" else desc
        query = query.order_by(direction(sort_column), desc(Patient.created_at))

        patients = list(db.scalars(query).all())
        if has_whatsapp is None:
            return patients

        return [
            patient
            for patient in patients
            if is_valid_whatsapp_number(patient.phone) == has_whatsapp
        ]

    def update_patient(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        patient_id: UUID,
        payload: PatientUpdateRequest,
    ) -> Patient:
        patient = self.get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        if patient is None:
            raise PatientServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente nao encontrado.",
            )

        if (
            payload.overwrite_initial_registration
            and _clean_optional(payload.overwrite_reason) is None
        ):
            raise PatientServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Sobrescrita exige justificativa.",
            )

        try:
            normalized = normalize_patient_profile_payload(payload)
        except PatientProfileValidationError as exc:
            raise PatientServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc

        previous_data = _patient_snapshot(patient)
        _apply_normalized_profile(patient, normalized)
        if payload.overwrite_initial_registration:
            patient.profile_source = "manual"

        new_data = _patient_snapshot(patient)
        changed_fields = _diff_changed_fields(previous_data, new_data)

        if not changed_fields:
            return patient

        change_type = "overwritten" if payload.overwrite_initial_registration else "updated"
        reason = _clean_optional(payload.overwrite_reason)
        _append_profile_change(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            changed_by_user_id=actor_user_id,
            change_type=change_type,
            changed_fields=changed_fields,
            previous_data=previous_data,
            new_data=new_data,
            reason=reason,
        )
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            event_type=(
                "patient_profile_overwritten"
                if payload.overwrite_initial_registration
                else "patient_profile_updated"
            ),
            actor_type="psychologist",
            actor_id=actor_user_id,
            payload={
                "changed_fields": changed_fields,
                "reason": reason,
            },
        )
        return patient

    def archive_patient(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        actor_user_id: UUID,
        patient_id: UUID,
    ) -> Patient:
        patient = self.get_patient_for_tenant(db, tenant_id=tenant_id, patient_id=patient_id)
        if patient is None:
            raise PatientServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paciente nao encontrado.",
            )

        archived_at = _utcnow()
        previous_data = _patient_snapshot(patient)
        patient.archived_at = archived_at
        patient.archived_by_user_id = actor_user_id

        _append_profile_change(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            changed_by_user_id=actor_user_id,
            change_type="archived",
            changed_fields=["archived_at", "archived_by_user_id"],
            previous_data=previous_data,
            new_data=None,
            reason="Paciente arquivado pelo psicologo.",
        )
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            event_type="patient_profile_archived",
            actor_type="psychologist",
            actor_id=actor_user_id,
            payload={"archived_at": archived_at.isoformat()},
        )
        return patient

    def list_profile_changes(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        limit: int = 120,
    ) -> list[PatientProfileChange]:
        query: Select[tuple[PatientProfileChange]] = select(PatientProfileChange).where(
            PatientProfileChange.tenant_id == tenant_id,
            PatientProfileChange.patient_id == patient_id,
        )
        query = query.order_by(PatientProfileChange.created_at.desc()).limit(
            max(1, min(limit, 500))
        )
        return list(db.scalars(query).all())

    def list_timeline_events(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient_id: UUID,
        limit: int = 120,
    ) -> list[TimelineEvent]:
        query: Select[tuple[TimelineEvent]] = select(TimelineEvent).where(
            TimelineEvent.tenant_id == tenant_id,
            TimelineEvent.patient_id == patient_id,
        )
        query = query.order_by(TimelineEvent.created_at.desc()).limit(max(1, min(limit, 500)))
        return list(db.scalars(query).all())

    def record_creation_from_intake(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        patient: Patient,
        actor_user_id: UUID,
        intake_id: UUID,
    ) -> None:
        new_data = _patient_snapshot(patient)
        _append_profile_change(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            changed_by_user_id=actor_user_id,
            change_type="created",
            changed_fields=sorted(new_data.keys()),
            previous_data=None,
            new_data=new_data,
            reason="Cadastro inicial proveniente da triagem.",
        )
        append_timeline_event(
            db,
            tenant_id=tenant_id,
            patient_id=patient.id,
            intake_id=intake_id,
            event_type="patient_profile_created",
            actor_type="psychologist",
            actor_id=actor_user_id,
            payload={
                "profile_source": patient.profile_source,
                "intake_id": str(intake_id),
                "changed_fields": sorted(new_data.keys()),
            },
        )


patient_service = PatientService()
