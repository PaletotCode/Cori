def login_access_token(client, *, email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_patient_crud_overwrite_history_and_whatsapp_filters(client, seed_tenant) -> None:
    tenant_a = seed_tenant(
        tenant_name="Tenant Pacientes A",
        email="pacientes.a@cori.dev",
        password="pacienteA123",
        user_full_name="Dra. Pacientes A",
        psychologist_display_name="Dra. Pacientes A",
        patient_name="Paciente Base A",
    )
    tenant_b = seed_tenant(
        tenant_name="Tenant Pacientes B",
        email="pacientes.b@cori.dev",
        password="pacienteB123",
        user_full_name="Dra. Pacientes B",
        psychologist_display_name="Dra. Pacientes B",
        patient_name="Paciente Base B",
    )

    token_a = login_access_token(client, email=tenant_a.email, password=tenant_a.password)
    token_b = login_access_token(client, email=tenant_b.email, password=tenant_b.password)

    create_primary = client.post(
        "/patients",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "full_name": "Paciente Silvia",
            "preferred_name": "Sil",
            "email": "silvia@cori.dev",
            "phone": "+55 (65) 99999-1234",
            "birth_date": "1992-08-04",
            "preferred_contact_channel": "whatsapp",
            "preferred_contact_period": "night",
            "communication_notes": "Prefere mensagens curtas",
        },
    )
    assert create_primary.status_code == 200
    created = create_primary.json()
    patient_id = created["id"]
    assert created["whatsapp_number_valid"] is True
    assert created["profile_source"] == "manual"

    create_secondary = client.post(
        "/patients",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "full_name": "Paciente Ana",
            "phone": "3211-1000",
            "preferred_contact_channel": "phone",
        },
    )
    assert create_secondary.status_code == 200

    list_sorted = client.get(
        "/patients?sort_by=full_name&sort_order=asc",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert list_sorted.status_code == 200
    sorted_payload = list_sorted.json()
    assert [item["full_name"] for item in sorted_payload] == [
        "Paciente Ana",
        "Paciente Base A",
        "Paciente Silvia",
    ]

    list_search = client.get(
        "/patients?search=silvia",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert list_search.status_code == 200
    assert len(list_search.json()) == 1
    assert list_search.json()[0]["id"] == patient_id

    list_whatsapp_only = client.get(
        "/patients?has_whatsapp=true",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert list_whatsapp_only.status_code == 200
    whatsapp_ids = {item["id"] for item in list_whatsapp_only.json()}
    assert patient_id in whatsapp_ids
    assert create_secondary.json()["id"] not in whatsapp_ids

    detail_before = client.get(
        f"/patients/{patient_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert detail_before.status_code == 200
    assert detail_before.json()["preferred_name"] == "Sil"

    overwrite = client.put(
        f"/patients/{patient_id}",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "full_name": "Paciente Silvia Ferreira",
            "preferred_name": "Silvia",
            "email": "silvia.ferreira@cori.dev",
            "phone": "+55 65 98484-1122",
            "birth_date": "1992-08-04",
            "pronouns": "ela/dela",
            "preferred_contact_channel": "email",
            "preferred_contact_period": "morning",
            "communication_notes": "Atualizado apos validacao documental.",
            "overwrite_initial_registration": True,
            "overwrite_reason": "Cadastro inicial tinha dados desatualizados.",
        },
    )
    assert overwrite.status_code == 200
    overwrite_payload = overwrite.json()
    assert overwrite_payload["full_name"] == "Paciente Silvia Ferreira"
    assert overwrite_payload["profile_source"] == "manual"

    changes = client.get(
        f"/patients/{patient_id}/changes",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert changes.status_code == 200
    changes_payload = changes.json()
    change_types = {change["change_type"] for change in changes_payload}
    assert "created" in change_types
    assert "overwritten" in change_types
    latest_overwrite = next(
        change for change in changes_payload if change["change_type"] == "overwritten"
    )
    assert "full_name" in latest_overwrite["changed_fields"]
    assert latest_overwrite["reason"] == "Cadastro inicial tinha dados desatualizados."

    timeline = client.get(
        f"/patients/{patient_id}/timeline-events",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert timeline.status_code == 200
    timeline_types = {event["event_type"] for event in timeline.json()}
    assert "patient_profile_created" in timeline_types
    assert "patient_profile_overwritten" in timeline_types

    cross_tenant_detail = client.get(
        f"/patients/{patient_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert cross_tenant_detail.status_code == 404

    archive = client.delete(
        f"/patients/{patient_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert archive.status_code == 200
    assert archive.json()["patient_id"] == patient_id

    after_archive = client.get(
        f"/patients/{patient_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert after_archive.status_code == 404
