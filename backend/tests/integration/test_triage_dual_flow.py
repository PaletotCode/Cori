from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.models import PatientIntake


def login_access_token(client, *, email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_invite(client, *, access_token: str, payload: dict[str, object]) -> dict[str, object]:
    response = client.post(
        "/intakes/invites",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
    )
    assert response.status_code == 200
    return response.json()


def test_simple_invite_flow_end_to_end(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Simple Invite",
        email="simple.invite@cori.dev",
        password="simple123",
        user_full_name="Dra. Convite",
        psychologist_display_name="Dra. Convite",
        patient_name="Paciente Inicial",
    )
    access_token = login_access_token(client, email=seeded.email, password=seeded.password)

    invite = create_invite(
        client,
        access_token=access_token,
        payload={
            "mode": "simple_invite",
            "expires_in_hours": 72,
            "invite_message": "Bem-vindo ao fluxo simples.",
        },
    )
    assert invite["mode"] == "simple_invite"
    assert invite["status"] == "pending_submission"
    assert len(invite["invite_token"]) >= 20
    assert "token=" in invite["invite_link"]

    public_view = client.get(f"/intake-links/{invite['invite_token']}")
    assert public_view.status_code == 200
    public_payload = public_view.json()
    assert public_payload["requires_custom_triage"] is False
    assert public_payload["status"] == "pending_submission"

    submit = client.post(
        f"/intake-links/{invite['invite_token']}/submit",
        json={
            "patient_full_name": "Paciente Convite Simples",
            "patient_email": "paciente.simple@cori.dev",
            "patient_phone": "+55 65 99999-0001",
            "consent_terms_accepted": True,
            "consent_privacy_accepted": True,
        },
    )
    assert submit.status_code == 200
    submit_payload = submit.json()
    assert submit_payload["status"] == "submitted"

    queue = client.get(
        "/intakes/queue?statuses=submitted",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert queue.status_code == 200
    queue_payload = queue.json()
    assert len(queue_payload) == 1
    assert queue_payload[0]["intake_id"] == invite["intake_id"]
    assert queue_payload[0]["patient_full_name"] == "Paciente Convite Simples"

    review = client.post(
        f"/intakes/{invite['intake_id']}/review",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"action": "approve", "note": "Aprovado apos cadastro inicial."},
    )
    assert review.status_code == 200
    review_payload = review.json()
    assert review_payload["status"] == "approved"
    assert review_payload["activated_patient_id"] is not None

    detail = client.get(
        f"/intakes/{invite['intake_id']}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["status"] == "approved"
    assert detail_payload["activated_patient_id"] == review_payload["activated_patient_id"]

    timeline = client.get(
        f"/intakes/timeline-events?intake_id={invite['intake_id']}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "intake_invite_created" in event_types
    assert "intake_link_opened" in event_types
    assert "intake_submitted" in event_types
    assert "intake_approved" in event_types
    assert "patient_activated" in event_types


def test_custom_triage_flow_with_complement_and_approval(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Custom Triage",
        email="custom.triage@cori.dev",
        password="custom123",
        user_full_name="Dr. Triagem",
        psychologist_display_name="Dr. Triagem",
        patient_name="Paciente Triagem Base",
    )
    access_token = login_access_token(client, email=seeded.email, password=seeded.password)

    invite = create_invite(
        client,
        access_token=access_token,
        payload={
            "mode": "custom_triage",
            "expires_in_hours": 48,
            "custom_questions": [
                {"prompt": "Qual o principal motivo da busca por terapia?", "required": True},
                {"prompt": "Existe preferencia de horario?", "required": False},
            ],
        },
    )

    public_view = client.get(f"/intake-links/{invite['invite_token']}")
    assert public_view.status_code == 200
    public_payload = public_view.json()
    assert public_payload["requires_custom_triage"] is True
    assert len(public_payload["custom_questions"]) == 2

    first_submit = client.post(
        f"/intake-links/{invite['invite_token']}/submit",
        json={
            "patient_full_name": "Paciente Triagem Custom",
            "patient_email": "paciente.custom@cori.dev",
            "patient_phone": "+55 65 99999-0002",
            "consent_terms_accepted": True,
            "consent_privacy_accepted": True,
            "triage_answers": {
                "q1": "Ansiedade recorrente nas ultimas semanas.",
            },
        },
    )
    assert first_submit.status_code == 200
    assert first_submit.json()["status"] == "submitted"

    complement = client.post(
        f"/intakes/{invite['intake_id']}/review",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"action": "request_complement", "note": "Descreva tambem sua disponibilidade."},
    )
    assert complement.status_code == 200
    assert complement.json()["status"] == "complement_requested"

    complement_view = client.get(f"/intake-links/{invite['invite_token']}")
    assert complement_view.status_code == 200
    assert complement_view.json()["status"] == "complement_requested"
    assert (
        complement_view.json()["complement_request_note"]
        == "Descreva tambem sua disponibilidade."
    )

    second_submit = client.post(
        f"/intake-links/{invite['invite_token']}/submit",
        json={
            "patient_full_name": "Paciente Triagem Custom",
            "patient_email": "paciente.custom@cori.dev",
            "patient_phone": "+55 65 99999-0002",
            "consent_terms_accepted": True,
            "consent_privacy_accepted": True,
            "triage_answers": {
                "q1": "Ansiedade recorrente nas ultimas semanas.",
                "q2": "Preferencia por segundas e quintas a noite.",
            },
        },
    )
    assert second_submit.status_code == 200
    assert second_submit.json()["status"] == "submitted"

    approve = client.post(
        f"/intakes/{invite['intake_id']}/review",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"action": "approve"},
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"
    assert approve.json()["activated_patient_id"] is not None

    detail = client.get(
        f"/intakes/{invite['intake_id']}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert detail.status_code == 200
    triage_answers = detail.json()["triage_answers"]
    assert triage_answers["q1"].startswith("Ansiedade")
    assert triage_answers["q2"].startswith("Preferencia")


def test_invite_link_invalid_and_expired(client, seed_tenant, session_factory) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Invite Expiration",
        email="expire.triage@cori.dev",
        password="expire123",
        user_full_name="Dra. Expiracao",
        psychologist_display_name="Dra. Expiracao",
        patient_name="Paciente Expiracao",
    )
    access_token = login_access_token(client, email=seeded.email, password=seeded.password)

    invalid = client.get("/intake-links/token-invalido-xyz")
    assert invalid.status_code == 404

    invite = create_invite(
        client,
        access_token=access_token,
        payload={"mode": "simple_invite", "expires_in_hours": 24},
    )

    with session_factory() as admin_session:
        admin_session.execute(text("SET LOCAL ROLE cori_app"))
        admin_session.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))
        intake = admin_session.scalar(
            select(PatientIntake).where(PatientIntake.id == invite["intake_id"])
        )
        assert intake is not None
        intake.invite_token_expires_at = datetime.now(UTC) - timedelta(minutes=1)
        admin_session.commit()

    expired_view = client.get(f"/intake-links/{invite['invite_token']}")
    assert expired_view.status_code == 410

    expired_submit = client.post(
        f"/intake-links/{invite['invite_token']}/submit",
        json={
            "patient_full_name": "Paciente Expirado",
            "consent_terms_accepted": True,
            "consent_privacy_accepted": True,
        },
    )
    assert expired_submit.status_code == 410


def test_tenant_isolation_and_request_auth_for_triage_endpoints(client, seed_tenant) -> None:
    tenant_a = seed_tenant(
        tenant_name="Tenant A Triage",
        email="triage.a@cori.dev",
        password="triageA123",
        user_full_name="Dr. Tenant A",
        psychologist_display_name="Dr. Tenant A",
        patient_name="Paciente Tenant A",
    )
    tenant_b = seed_tenant(
        tenant_name="Tenant B Triage",
        email="triage.b@cori.dev",
        password="triageB123",
        user_full_name="Dr. Tenant B",
        psychologist_display_name="Dr. Tenant B",
        patient_name="Paciente Tenant B",
    )
    token_a = login_access_token(client, email=tenant_a.email, password=tenant_a.password)
    token_b = login_access_token(client, email=tenant_b.email, password=tenant_b.password)

    invite_a = create_invite(
        client,
        access_token=token_a,
        payload={"mode": "simple_invite", "expires_in_hours": 24},
    )

    create_with_tenant_body = client.post(
        "/intakes/invites",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "mode": "simple_invite",
            "expires_in_hours": 24,
            "tenant_id": str(tenant_a.tenant_id),
        },
    )
    assert create_with_tenant_body.status_code == 422

    queue_b = client.get("/intakes/queue", headers={"Authorization": f"Bearer {token_b}"})
    assert queue_b.status_code == 200
    queue_b_ids = {item["intake_id"] for item in queue_b.json()}
    assert invite_a["intake_id"] not in queue_b_ids

    detail_b = client.get(
        f"/intakes/{invite_a['intake_id']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert detail_b.status_code == 404

    review_b = client.post(
        f"/intakes/{invite_a['intake_id']}/review",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"action": "reject", "note": "Nao deveria acessar."},
    )
    assert review_b.status_code == 404

    unauth_queue = client.get("/intakes/queue")
    assert unauth_queue.status_code == 401
