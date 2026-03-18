import pytest

from app.schemas.practice_profile import PracticeProfileUpsertRequest
from app.services.practice_profile_service import (
    PracticeProfileValidationError,
    normalize_practice_profile_payload,
)


def make_payload(**overrides: object) -> PracticeProfileUpsertRequest:
    payload = {
        "practice_name": "Clinica Aurora",
        "clinical_approach": "TCC",
        "service_modality": "hybrid",
        "in_person_address": "Rua das Flores, 120 - Sala 4",
        "session_price_cents": 25000,
        "currency": "BRL",
        "late_cancellation_window_hours": 24,
        "late_cancellation_fee_percent": 40,
        "no_show_fee_percent": 80,
        "notification_email_enabled": True,
        "notification_whatsapp_enabled": True,
        "notification_push_enabled": True,
        "session_reminder_hours_before": [48, 24, 2],
        "default_triage_mode": "standard",
        "default_triage_message": None,
    }
    payload.update(overrides)
    return PracticeProfileUpsertRequest.model_validate(payload)


def test_online_modality_clears_in_person_address() -> None:
    normalized = normalize_practice_profile_payload(
        make_payload(
            service_modality="online",
            in_person_address="Av. que deve ser removida",
        )
    )

    assert normalized.in_person_address is None


def test_presential_or_hybrid_requires_in_person_address() -> None:
    with pytest.raises(PracticeProfileValidationError):
        normalize_practice_profile_payload(
            make_payload(
                service_modality="presential",
                in_person_address=None,
            )
        )


def test_reminder_hours_cannot_have_duplicates() -> None:
    with pytest.raises(PracticeProfileValidationError):
        normalize_practice_profile_payload(
            make_payload(session_reminder_hours_before=[24, 24, 2])
        )


def test_custom_triage_requires_message_with_minimum_length() -> None:
    with pytest.raises(PracticeProfileValidationError):
        normalize_practice_profile_payload(
            make_payload(
                default_triage_mode="custom",
                default_triage_message="curta",
            )
        )


def test_standard_triage_clears_custom_message() -> None:
    normalized = normalize_practice_profile_payload(
        make_payload(
            default_triage_mode="standard",
            default_triage_message="Mensagem que deve sumir no modo standard",
        )
    )

    assert normalized.default_triage_message is None


def test_reminder_hours_must_stay_inside_supported_range() -> None:
    with pytest.raises(PracticeProfileValidationError):
        normalize_practice_profile_payload(
            make_payload(session_reminder_hours_before=[24, 0, 2])
        )
