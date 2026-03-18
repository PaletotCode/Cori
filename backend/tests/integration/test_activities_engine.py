from datetime import UTC, datetime, timedelta


def login_access_token(client, *, email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_activity(
    client,
    *,
    access_token: str,
    patient_id: str,
    activity_type: str = "simple_task",
    title: str = "Preencher diario de humor",
    due_at: datetime | None = None,
    recurrence_rule: str = "none",
    recurrence_interval: int = 1,
) -> dict[str, object]:
    due = due_at or (datetime.now(UTC) + timedelta(days=2))
    response = client.post(
        "/activities",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "patient_id": patient_id,
            "activity_type": activity_type,
            "title": title,
            "description": "Executar atividade no horario combinado.",
            "instructions": "Leia o enunciado e finalize quando concluir.",
            "document_url": "https://cori.dev/materials/atividade.pdf"
            if activity_type == "document_reading"
            else None,
            "configuration": {"minutes_target": 10},
            "due_at": due.isoformat(),
            "recurrence_rule": recurrence_rule,
            "recurrence_interval": recurrence_interval,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_activity_creation_assignment_and_timeline(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Atividades Criacao",
        email="atividades.criacao@cori.dev",
        password="atividade123",
        user_full_name="Dra. Atividades",
        psychologist_display_name="Dra. Atividades",
        patient_name="Paciente Atividade",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    created = create_activity(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        activity_type="habit",
        title="Registrar consumo de agua",
        recurrence_rule="daily",
        recurrence_interval=1,
    )
    assert created["status"] == "assigned"
    assert created["activity_type"] == "habit"
    assert "token=" in created["patient_access_link"]

    listed = client.get(
        "/activities",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listed.status_code == 200
    payload = listed.json()
    assert any(item["id"] == created["id"] for item in payload)

    timeline = client.get(
        f"/activities/{created['id']}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "assigned" in event_types


def test_activity_state_transitions_with_elapsed_time(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Atividades Estado",
        email="atividades.estado@cori.dev",
        password="estado123",
        user_full_name="Dr. Estados",
        psychologist_display_name="Dr. Estados",
        patient_name="Paciente Fluxo",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    created = create_activity(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        activity_type="guided_meditation",
        title="Meditacao guiada de respiracao",
    )
    patient_token = created["patient_access_token"]

    listed = client.get(f"/activity-links/{patient_token}/activities")
    assert listed.status_code == 200
    assert listed.json()["patient_id"] == str(seeded.patient_id)

    opened = client.post(
        f"/activity-links/{patient_token}/activities/{created['id']}/actions",
        json={"action": "open"},
    )
    assert opened.status_code == 200
    assert opened.json()["activity"]["status"] in {"opened", "assigned"}

    started = client.post(
        f"/activity-links/{patient_token}/activities/{created['id']}/actions",
        json={"action": "start"},
    )
    assert started.status_code == 200
    assert started.json()["activity"]["status"] == "in_progress"

    paused = client.post(
        f"/activity-links/{patient_token}/activities/{created['id']}/actions",
        json={"action": "pause"},
    )
    assert paused.status_code == 200
    assert paused.json()["activity"]["status"] == "paused"

    resumed = client.post(
        f"/activity-links/{patient_token}/activities/{created['id']}/actions",
        json={"action": "start"},
    )
    assert resumed.status_code == 200
    assert resumed.json()["activity"]["status"] == "in_progress"

    completed = client.post(
        f"/activity-links/{patient_token}/activities/{created['id']}/actions",
        json={"action": "complete", "feedback_note": "Consegui finalizar com calma."},
    )
    assert completed.status_code == 200
    assert completed.json()["activity"]["status"] == "completed"
    assert completed.json()["activity"]["feedback_note"] == "Consegui finalizar com calma."
    assert completed.json()["activity"]["execution_elapsed_seconds"] >= 0

    reopened = client.post(
        f"/activities/{created['id']}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "reopen", "reason": "Refazer em novo contexto terapeutico."},
    )
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "assigned"

    timeline = client.get(
        f"/activities/{created['id']}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "assigned" in event_types
    assert "opened" in event_types
    assert "started" in event_types
    assert "paused" in event_types
    assert "resumed" in event_types
    assert "completed" in event_types
    assert "reopened" in event_types


def test_realtime_notifies_activity_assignment(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Atividades Realtime",
        email="atividades.realtime@cori.dev",
        password="realtime123",
        user_full_name="Dra. Tempo Real",
        psychologist_display_name="Dra. Tempo Real",
        patient_name="Paciente Realtime",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    with client.websocket_connect(f"/ws?token={token}") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"
        websocket.send_json({"type": "subscribe", "channel": f"tenant:{seeded.tenant_id}"})

        _created = create_activity(
            client,
            access_token=token,
            patient_id=str(seeded.patient_id),
            activity_type="simple_task",
            title="Enviar relato diario",
        )

        notification = websocket.receive_json()
        assert notification["type"] == "notification"
        assert notification["title"] == "Nova atividade atribuida"


def test_overdue_scheduler_marks_activity_and_emits_timeline(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Atividades Overdue",
        email="atividades.overdue@cori.dev",
        password="overdue123",
        user_full_name="Dr. Overdue",
        psychologist_display_name="Dr. Overdue",
        patient_name="Paciente Overdue",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    past_due = datetime.now(UTC) - timedelta(hours=3)
    created = create_activity(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        activity_type="document_reading",
        title="Leitura de psicoeducacao",
        due_at=past_due,
    )

    run_scheduler = client.post(
        "/scheduler/activities-overdue/run",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert run_scheduler.status_code == 200
    assert run_scheduler.json()["processed"] >= 1
    assert run_scheduler.json()["marked_overdue"] >= 1

    detail = client.get(
        f"/activities/{created['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "overdue"

    timeline = client.get(
        f"/activities/{created['id']}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "overdue" in event_types
