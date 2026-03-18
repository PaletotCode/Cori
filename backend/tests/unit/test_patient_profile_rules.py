from datetime import date, timedelta

import pytest

from app.schemas.patient import PatientCreateRequest
from app.services.patient_service import (
    PatientProfileValidationError,
    is_valid_whatsapp_number,
    normalize_patient_profile_payload,
)


def make_payload(**overrides: object) -> PatientCreateRequest:
    payload = {
        "full_name": "  Paciente Aurora  ",
        "preferred_name": "  Aurora  ",
        "email": "  PACIENTE@CORI.DEV ",
        "phone": " (65) 99999-0001 ",
        "birth_date": date(1995, 1, 10),
        "pronouns": "  ela/dela ",
        "emergency_contact_name": "  Responsavel ",
        "emergency_contact_phone": "65 3211-1000",
        "preferred_contact_channel": "whatsapp",
        "preferred_contact_period": "night",
        "communication_notes": "  prefere mensagem curta. ",
    }
    payload.update(overrides)
    return PatientCreateRequest.model_validate(payload)


def test_normalize_profile_payload_trims_and_standardizes_values() -> None:
    normalized = normalize_patient_profile_payload(make_payload())

    assert normalized.full_name == "Paciente Aurora"
    assert normalized.preferred_name == "Aurora"
    assert normalized.email == "paciente@cori.dev"
    assert normalized.phone == "+65999990001"
    assert normalized.emergency_contact_phone == "+6532111000"
    assert normalized.communication_notes == "prefere mensagem curta."


def test_birth_date_cannot_be_in_future() -> None:
    tomorrow = date.today() + timedelta(days=1)
    with pytest.raises(PatientProfileValidationError):
        normalize_patient_profile_payload(make_payload(birth_date=tomorrow))


def test_phone_must_have_supported_digit_count() -> None:
    with pytest.raises(PatientProfileValidationError):
        normalize_patient_profile_payload(make_payload(phone="123"))


def test_whatsapp_validation_supports_fallback_logic() -> None:
    assert is_valid_whatsapp_number("+5565999990001") is True
    assert is_valid_whatsapp_number("+551234567") is False
    assert is_valid_whatsapp_number(None) is False
