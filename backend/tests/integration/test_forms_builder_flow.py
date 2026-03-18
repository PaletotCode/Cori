from datetime import UTC, datetime, timedelta


def login_access_token(client, *, email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_form(
    client,
    *,
    access_token: str,
    patient_id: str,
) -> dict[str, object]:
    response = client.post(
        "/forms",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "patient_id": patient_id,
            "title": "Check-in emocional semanal",
            "subtitle": "Monitoramento orientado",
            "header": "Responda com calma e sinceridade.",
            "sections": [
                {
                    "title": "Estado atual",
                    "description": "Perguntas base",
                    "questions": [
                        {
                            "label": "Como voce descreveria sua semana?",
                            "field_type": "long_text",
                            "required": True,
                        },
                        {
                            "label": "Qual emocao predominou?",
                            "field_type": "multiple_choice",
                            "required": True,
                            "options": ["alegria", "ansiedade", "tristeza"],
                        },
                        {
                            "label": "Quais sinais percebeu no corpo?",
                            "field_type": "checkbox",
                            "required": False,
                            "options": ["tensao", "fadiga", "insomnia"],
                        },
                        {
                            "label": "Escala de energia",
                            "field_type": "scale",
                            "required": True,
                            "scale_min": 1,
                            "scale_max": 5,
                        },
                        {
                            "label": "Quando ocorreu o pico de estresse?",
                            "field_type": "date_time",
                            "required": False,
                        },
                        {
                            "label": "Uma palavra para hoje",
                            "field_type": "short_text",
                            "required": True,
                        },
                    ],
                }
            ],
        },
    )
    assert response.status_code == 200
    return response.json()


def test_forms_cycle_with_partial_submit_review_and_timeline(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Forms Ciclo",
        email="forms.ciclo@cori.dev",
        password="forms123",
        user_full_name="Dra. Forms",
        psychologist_display_name="Dra. Forms",
        patient_name="Paciente Forms",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    created = create_form(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
    )
    form_id = created["id"]
    patient_token = created["patient_access_token"]

    with client.websocket_connect(f"/ws?token={token}") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"
        websocket.send_json(
            {
                "type": "subscribe",
                "channel": f"tenant:{seeded.tenant_id}",
            }
        )

        publish = client.post(
            f"/forms/{form_id}/actions",
            headers={"Authorization": f"Bearer {token}"},
            json={"action": "publish"},
        )
        assert publish.status_code == 200
        assert publish.json()["status"] == "published"

        send = client.post(
            f"/forms/{form_id}/actions",
            headers={"Authorization": f"Bearer {token}"},
            json={"action": "send"},
        )
        assert send.status_code == 200
        assert send.json()["status"] == "assigned"

        notification = websocket.receive_json()
        assert notification["type"] == "notification"
        assert notification["title"] == "Novo formulario disponivel"

    listed = client.get(f"/form-links/{patient_token}/forms")
    assert listed.status_code == 200
    public_forms = listed.json()["forms"]
    assert any(item["id"] == form_id for item in public_forms)

    open_form = client.post(
        f"/form-links/{patient_token}/forms/{form_id}/actions",
        json={"action": "open"},
    )
    assert open_form.status_code == 200
    assert open_form.json()["form"]["status"] == "opened"

    partial = client.post(
        f"/form-links/{patient_token}/forms/{form_id}/actions",
        json={
            "action": "partial_save",
            "answers": {
                "q1": "Semana desafiadora, mas com progresso.",
                "q2": "ansiedade",
            },
        },
    )
    assert partial.status_code == 200
    assert partial.json()["form"]["status"] == "partial_saved"

    submit = client.post(
        f"/form-links/{patient_token}/forms/{form_id}/actions",
        json={
            "action": "submit",
            "answers": {
                "q1": "Semana desafiadora, mas com progresso.",
                "q2": "ansiedade",
                "q3": ["tensao", "fadiga"],
                "q4": 3,
                "q5": "2026-03-18T10:00:00Z",
                "q6": "resiliencia",
            },
        },
    )
    assert submit.status_code == 200
    assert submit.json()["form"]["status"] == "submitted"
    assert submit.json()["form"]["response_data"]["q6"] == "resiliencia"

    received = client.get(
        "/forms/responses",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert received.status_code == 200
    assert any(item["id"] == form_id for item in received.json())

    review = client.post(
        f"/forms/{form_id}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "review", "review_note": "Resposta revisada em sessao."},
    )
    assert review.status_code == 200
    assert review.json()["status"] == "reviewed"

    timeline = client.get(
        f"/forms/{form_id}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "assigned" in event_types
    assert "opened" in event_types
    assert "partial_saved" in event_types
    assert "submitted" in event_types
    assert "reviewed" in event_types


def test_forms_schedule_dispatch_flow(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Forms Agendamento",
        email="forms.agenda@cori.dev",
        password="forms123",
        user_full_name="Dr. Agenda Forms",
        psychologist_display_name="Dr. Agenda Forms",
        patient_name="Paciente Agenda Forms",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)
    created = create_form(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
    )
    form_id = created["id"]

    publish = client.post(
        f"/forms/{form_id}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "publish"},
    )
    assert publish.status_code == 200

    scheduled = client.post(
        f"/forms/{form_id}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "schedule",
            "scheduled_send_at": (datetime.now(UTC) - timedelta(minutes=5)).isoformat(),
        },
    )
    assert scheduled.status_code == 200
    assert scheduled.json()["status"] == "scheduled"

    run_dispatch = client.post(
        "/scheduler/forms-dispatch/run",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert run_dispatch.status_code == 200
    assert run_dispatch.json()["processed"] >= 1
    assert run_dispatch.json()["dispatched"] >= 1

    detail = client.get(
        f"/forms/{form_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "assigned"


def test_forms_builder_validation_rejects_missing_options(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Forms Validacao",
        email="forms.validacao@cori.dev",
        password="forms123",
        user_full_name="Dra. Validacao",
        psychologist_display_name="Dra. Validacao",
        patient_name="Paciente Validacao",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    invalid = client.post(
        "/forms",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "patient_id": str(seeded.patient_id),
            "title": "Formulario invalido",
            "sections": [
                {
                    "title": "Secao 1",
                    "questions": [
                        {
                            "label": "Escolha uma opcao",
                            "field_type": "multiple_choice",
                            "required": True,
                            "options": [],
                        }
                    ],
                }
            ],
        },
    )
    assert invalid.status_code == 422
    assert "exige opcoes" in invalid.json()["detail"]
