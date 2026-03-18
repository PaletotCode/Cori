from copy import deepcopy


def login_and_get_access_token(client, email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def make_payload() -> dict[str, object]:
    return {
        "practice_name": "Clinica Aurora Integral",
        "clinical_approach": "Terapia cognitivo-comportamental",
        "service_modality": "hybrid",
        "in_person_address": "Rua das Acacias, 120 - Sala 5",
        "session_price_cents": 32000,
        "currency": "BRL",
        "late_cancellation_window_hours": 24,
        "late_cancellation_fee_percent": 40,
        "no_show_fee_percent": 80,
        "notification_email_enabled": True,
        "notification_whatsapp_enabled": True,
        "notification_push_enabled": False,
        "session_reminder_hours_before": [48, 24, 2],
        "default_triage_mode": "custom",
        "default_triage_message": "Por favor descreva seu objetivo com a terapia.",
    }


def test_practice_profile_get_returns_404_when_missing(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Profile Missing",
        email="missing@cori.dev",
        password="missing123",
        user_full_name="Dra. Missing",
        psychologist_display_name="Dra. Missing",
        patient_name="Paciente Missing",
    )
    access_token = login_and_get_access_token(client, seeded.email, seeded.password)

    response = client.get(
        "/practice-profile",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 404


def test_practice_profile_upsert_and_read(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Onboarding",
        email="onboarding@cori.dev",
        password="onboarding123",
        user_full_name="Dra. Onboarding",
        psychologist_display_name="Dra. Onboarding",
        patient_name="Paciente Onboarding",
    )
    access_token = login_and_get_access_token(client, seeded.email, seeded.password)
    payload = make_payload()

    upsert_response = client.put(
        "/practice-profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
    )
    assert upsert_response.status_code == 200
    upsert_json = upsert_response.json()

    assert upsert_json["tenant_id"] == str(seeded.tenant_id)
    assert upsert_json["practice_name"] == payload["practice_name"]
    assert upsert_json["default_triage_mode"] == "custom"
    assert upsert_json["onboarding_completed"] is True

    get_response = client.get(
        "/practice-profile",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert get_response.status_code == 200
    get_json = get_response.json()
    assert get_json["practice_name"] == payload["practice_name"]
    assert get_json["session_reminder_hours_before"] == [48, 24, 2]

    me_response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["onboarding_completed"] is True


def test_practice_profile_body_rejects_tenant_id(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Reject Body",
        email="rejectbody@cori.dev",
        password="reject123",
        user_full_name="Dr. Reject",
        psychologist_display_name="Dr. Reject",
        patient_name="Paciente Reject",
    )
    access_token = login_and_get_access_token(client, seeded.email, seeded.password)
    payload = make_payload()
    payload["tenant_id"] = str(seeded.tenant_id)

    response = client.put(
        "/practice-profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
    )

    assert response.status_code == 422


def test_practice_profile_blocks_invalid_completion(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Invalid Payload",
        email="invalidpayload@cori.dev",
        password="invalid123",
        user_full_name="Dra. Invalid",
        psychologist_display_name="Dra. Invalid",
        patient_name="Paciente Invalid",
    )
    access_token = login_and_get_access_token(client, seeded.email, seeded.password)
    payload = make_payload()
    payload["practice_name"] = "AB"

    response = client.put(
        "/practice-profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
    )

    assert response.status_code == 422


def test_practice_profile_isolation_between_tenants(client, seed_tenant) -> None:
    tenant_a = seed_tenant(
        tenant_name="Tenant Practice A",
        email="practice-a@cori.dev",
        password="practiceA123",
        user_full_name="Dr. Practice A",
        psychologist_display_name="Dr. Practice A",
        patient_name="Paciente Practice A",
    )
    tenant_b = seed_tenant(
        tenant_name="Tenant Practice B",
        email="practice-b@cori.dev",
        password="practiceB123",
        user_full_name="Dr. Practice B",
        psychologist_display_name="Dr. Practice B",
        patient_name="Paciente Practice B",
    )

    token_a = login_and_get_access_token(client, tenant_a.email, tenant_a.password)
    token_b = login_and_get_access_token(client, tenant_b.email, tenant_b.password)

    payload_a = make_payload()
    payload_b = deepcopy(make_payload())
    payload_b["practice_name"] = "Clinica Boreal Integral"
    payload_b["default_triage_mode"] = "standard"
    payload_b["default_triage_message"] = None

    upsert_a = client.put(
        "/practice-profile",
        headers={"Authorization": f"Bearer {token_a}"},
        json=payload_a,
    )
    assert upsert_a.status_code == 200
    upsert_b = client.put(
        "/practice-profile",
        headers={"Authorization": f"Bearer {token_b}"},
        json=payload_b,
    )
    assert upsert_b.status_code == 200

    get_a = client.get(
        "/practice-profile",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    get_b = client.get(
        "/practice-profile",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert get_a.status_code == 200
    assert get_b.status_code == 200

    assert get_a.json()["practice_name"] == payload_a["practice_name"]
    assert get_b.json()["practice_name"] == payload_b["practice_name"]
    assert get_a.json()["tenant_id"] != get_b.json()["tenant_id"]
