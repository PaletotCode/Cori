from app.services.timeline_natural_language import (
    build_patient_change_natural_summary,
    build_timeline_natural_content,
)


def test_patient_change_summary_translates_profile_fields_to_portuguese() -> None:
    summary = build_patient_change_natural_summary(
        change_type="created",
        changed_fields=["birth_date", "communication_notes", "email", "emergency_contact_name"],
        reason="Cadastro inicial manual.",
    )

    assert summary.startswith("Criamos o cadastro inicial deste paciente.")
    assert "data de nascimento" in summary
    assert "observacoes de comunicacao" in summary
    assert "e-mail" in summary
    assert "contato de emergencia" in summary
    assert "Motivo informado: Cadastro inicial manual." in summary
    assert "Birth date" not in summary
    assert "Communication notes" not in summary


def test_profile_event_detail_uses_natural_pt_labels() -> None:
    natural = build_timeline_natural_content(
        category="profile",
        event_type="patient_profile_created",
        actor_type="psychologist",
        payload={
            "changed_fields": ["Birth date", "Communication notes", "Emergency contact name"],
        },
    )

    assert (
        natural.detail
        == "Criamos o cadastro inicial com data de nascimento, observacoes de comunicacao e contato de emergencia."
    )
    assert "Birth date" not in natural.detail
    assert "Communication notes" not in natural.detail
