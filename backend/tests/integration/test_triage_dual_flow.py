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


def validate_access_code(client, *, code: str) -> dict[str, object]:
    response = client.post(
        "/intakes/access-codes/validate",
        json={"code": code},
    )
    assert response.status_code == 200
    return response.json()


def activate_access_code(client, *, code: str) -> dict[str, object]:
    response = client.post(
        "/intakes/access-codes/activate",
        json={"code": code},
    )
    assert response.status_code == 200
    return response.json()


def get_queue_summary(client, *, access_token: str) -> dict[str, int]:
    response = client.get(
        "/intakes/queue/summary",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    return response.json()


def build_wrong_but_well_formed_access_code(access_code: str) -> str:
    key, secret, _ = access_code.strip().upper().split("-")
    candidate_int = (int(secret) + 1) % 10_000
    candidate_secret = f"{candidate_int:04d}"
    if candidate_secret == secret:
        candidate_secret = f"{(candidate_int + 1) % 10_000:04d}"

    checksum_total = sum(ord(char) for char in f"{key}{candidate_secret}")
    checksum = f"{checksum_total % 97:02d}"
    return f"{key}-{candidate_secret}-{checksum}"


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
    assert isinstance(invite["access_code"], str)
    assert len(invite["access_code"]) >= 10
    assert "token=" in invite["invite_link"]

    summary_after_invite = get_queue_summary(client, access_token=access_token)
    assert summary_after_invite["total"] == 1
    assert summary_after_invite["pending_submission"] == 1
    assert summary_after_invite["submitted"] == 0
    assert summary_after_invite["actionable"] == 0

    validation = validate_access_code(client, code=invite["access_code"])
    assert validation["valid"] is True
    assert validation["intake_id"] == invite["intake_id"]
    assert validation["status"] == "pending_submission"

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

    summary_after_submit = get_queue_summary(client, access_token=access_token)
    assert summary_after_submit["pending_submission"] == 0
    assert summary_after_submit["submitted"] == 1
    assert summary_after_submit["actionable"] == 1

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

    summary_after_approval = get_queue_summary(client, access_token=access_token)
    assert summary_after_approval["submitted"] == 0
    assert summary_after_approval["approved"] == 1
    assert summary_after_approval["actionable"] == 0

    validation_after_approval = validate_access_code(client, code=invite["access_code"])
    assert validation_after_approval["valid"] is False
    assert "nao esta mais disponivel" in validation_after_approval["message"].lower()

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


def test_access_code_rotate_and_lock_protection(client, seed_tenant, session_factory) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Access Code Lock",
        email="access.code@cori.dev",
        password="access123",
        user_full_name="Dra. Codigo",
        psychologist_display_name="Dra. Codigo",
        patient_name="Paciente Codigo",
    )
    access_token = login_access_token(client, email=seeded.email, password=seeded.password)

    invite = create_invite(
        client,
        access_token=access_token,
        payload={
            "mode": "simple_invite",
            "expires_in_hours": 72,
            "access_code_alias": "Didia",
        },
    )
    original_code = invite["access_code"]

    for _ in range(5):
        wrong_code = build_wrong_but_well_formed_access_code(original_code)
        invalid = validate_access_code(client, code=wrong_code)
        assert invalid["valid"] is False

    locked = validate_access_code(client, code=original_code)
    assert locked["valid"] is False
    assert "alguns minutos" in locked["message"].lower()

    rotate = client.post(
        f"/intakes/{invite['intake_id']}/access-code/rotate",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"alias": "Didia"},
    )
    assert rotate.status_code == 200
    rotated_payload = rotate.json()
    assert rotated_payload["intake_id"] == invite["intake_id"]
    assert rotated_payload["access_code"] != original_code

    old_validation = validate_access_code(client, code=original_code)
    assert old_validation["valid"] is False

    new_validation = validate_access_code(client, code=rotated_payload["access_code"])
    assert new_validation["valid"] is True
    assert new_validation["intake_id"] == invite["intake_id"]

    with session_factory() as admin_session:
        admin_session.execute(text("SET LOCAL ROLE cori_app"))
        admin_session.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))
        intake = admin_session.scalar(
            select(PatientIntake).where(PatientIntake.id == invite["intake_id"])
        )
        assert intake is not None
        assert intake.access_code_attempts == 0
        assert intake.access_code_locked_until is None


def test_access_code_activation_requires_approval_and_rotates_token(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Access Activation",
        email="access.activation@cori.dev",
        password="activation123",
        user_full_name="Dra. Ativacao",
        psychologist_display_name="Dra. Ativacao",
        patient_name="Paciente Ativacao",
    )
    access_token = login_access_token(client, email=seeded.email, password=seeded.password)

    invite = create_invite(
        client,
        access_token=access_token,
        payload={
            "mode": "simple_invite",
            "expires_in_hours": 72,
            "access_code_alias": "Didia",
        },
    )

    pending_activation = activate_access_code(client, code=invite["access_code"])
    assert pending_activation["access_granted"] is False
    assert pending_activation["status"] == "pending_submission"
    assert "falta enviar" in pending_activation["message"].lower()
    assert pending_activation["patient_access_token"] is None

    submit = client.post(
        f"/intake-links/{invite['invite_token']}/submit",
        json={
            "patient_full_name": "Paciente Ativacao",
            "patient_email": "paciente.ativacao@cori.dev",
            "patient_phone": "+55 65 99999-0010",
            "consent_terms_accepted": True,
            "consent_privacy_accepted": True,
        },
    )
    assert submit.status_code == 200
    assert submit.json()["status"] == "submitted"

    waiting_activation = activate_access_code(client, code=invite["access_code"])
    assert waiting_activation["access_granted"] is False
    assert waiting_activation["status"] == "submitted"
    assert "aguarde" in waiting_activation["message"].lower()
    assert waiting_activation["patient_access_token"] is None

    review = client.post(
        f"/intakes/{invite['intake_id']}/review",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"action": "approve"},
    )
    assert review.status_code == 200
    assert review.json()["status"] == "approved"
    approved_patient_id = review.json()["activated_patient_id"]
    assert approved_patient_id is not None

    first_activation = activate_access_code(client, code=invite["access_code"])
    assert first_activation["access_granted"] is True
    assert first_activation["status"] == "approved"
    assert first_activation["tenant_id"] == str(seeded.tenant_id)
    assert first_activation["patient_id"] == approved_patient_id
    first_public_token = first_activation["patient_access_token"]
    assert isinstance(first_public_token, str)
    assert len(first_public_token) >= 20

    first_preferences = client.get(f"/notification-links/{first_public_token}/preferences")
    assert first_preferences.status_code == 200

    second_activation = activate_access_code(client, code=invite["access_code"])
    assert second_activation["access_granted"] is True
    second_public_token = second_activation["patient_access_token"]
    assert isinstance(second_public_token, str)
    assert second_public_token != first_public_token

    old_token_preferences = client.get(f"/notification-links/{first_public_token}/preferences")
    assert old_token_preferences.status_code == 404

    new_token_preferences = client.get(f"/notification-links/{second_public_token}/preferences")
    assert new_token_preferences.status_code == 200

    timeline = client.get(
        f"/intakes/timeline-events?intake_id={invite['intake_id']}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "patient_portal_access_issued" in event_types


def test_realtime_emits_intake_updates_for_tenant(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Realtime Intake",
        email="realtime.intake@cori.dev",
        password="realtime123",
        user_full_name="Dra. Realtime Intake",
        psychologist_display_name="Dra. Realtime Intake",
        patient_name="Paciente Realtime Intake",
    )
    access_token = login_access_token(client, email=seeded.email, password=seeded.password)

    invite = create_invite(
        client,
        access_token=access_token,
        payload={"mode": "simple_invite", "expires_in_hours": 72},
    )

    with client.websocket_connect(f"/ws?token={access_token}") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"

        websocket.send_json(
            {
                "type": "subscribe",
                "channel": f"tenant:{seeded.tenant_id}",
            }
        )

        submit = client.post(
            f"/intake-links/{invite['invite_token']}/submit",
            json={
                "patient_full_name": "Paciente Realtime Intake",
                "patient_email": "paciente.realtime@cori.dev",
                "consent_terms_accepted": True,
                "consent_privacy_accepted": True,
            },
        )
        assert submit.status_code == 200

        submitted_notification = websocket.receive_json()
        assert submitted_notification["type"] == "notification"
        assert submitted_notification["event_type"] == "intake_submitted"
        assert submitted_notification["category"] == "triage"
        assert submitted_notification["entity_type"] == "intake"
        assert submitted_notification["entity_id"] == invite["intake_id"]
        assert submitted_notification["metadata"]["status"] == "submitted"

        review = client.post(
            f"/intakes/{invite['intake_id']}/review",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"action": "approve"},
        )
        assert review.status_code == 200
        assert review.json()["status"] == "approved"

        approved_notification = websocket.receive_json()
        assert approved_notification["type"] == "notification"
        assert approved_notification["event_type"] == "intake_approved"
        assert approved_notification["category"] == "triage"
        assert approved_notification["entity_type"] == "intake"
        assert approved_notification["entity_id"] == invite["intake_id"]
        assert approved_notification["metadata"]["status"] == "approved"
