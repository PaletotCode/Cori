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
) -> dict[str, object]:
    response = client.post(
        "/activities",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "patient_id": patient_id,
            "activity_type": "simple_task",
            "title": "Preencher escala de humor",
            "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        },
    )
    assert response.status_code == 200
    return response.json()


def create_form_draft(
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
            "title": "Formulario para regras",
            "sections": [
                {
                    "title": "Secao 1",
                    "questions": [
                        {
                            "label": "Como voce esta hoje?",
                            "field_type": "short_text",
                            "required": True,
                        }
                    ],
                }
            ],
        },
    )
    assert response.status_code == 200
    return response.json()


def share_document(
    client,
    *,
    access_token: str,
    patient_id: str,
    document_id: str,
    document_title: str,
) -> dict[str, object]:
    response = client.post(
        f"/patients/{patient_id}/documents/{document_id}/share",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "action": "shared",
            "document_title": document_title,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_notifications_e2e_tracking_and_realtime(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Prompt10 E2E",
        email="prompt10.e2e@cori.dev",
        password="prompt10e2e",
        user_full_name="Dra. Prompt10",
        psychologist_display_name="Dra. Prompt10",
        patient_name="Paciente Prompt10",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    with client.websocket_connect(f"/ws?token={token}") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"
        websocket.send_json(
            {
                "type": "subscribe",
                "channel": f"tenant:{seeded.tenant_id}",
            }
        )

        created = create_activity(
            client,
            access_token=token,
            patient_id=str(seeded.patient_id),
        )

        notification = websocket.receive_json()
        assert notification["type"] == "notification"
        assert notification["title"] == "Nova atividade atribuida"

    list_deliveries = client.get(
        f"/patients/{seeded.patient_id}/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_deliveries.status_code == 200
    deliveries = list_deliveries.json()
    assert len(deliveries) >= 1
    first_delivery = deliveries[0]
    assert first_delivery["status"] == "delivered"
    assert first_delivery["sent_at"] is not None
    assert first_delivery["delivered_at"] is not None

    patient_token = created["patient_access_token"]
    inbox = client.get(f"/notification-links/{patient_token}/inbox")
    assert inbox.status_code == 200
    inbox_payload = inbox.json()
    assert inbox_payload["patient_id"] == str(seeded.patient_id)
    assert any(item["id"] == first_delivery["id"] for item in inbox_payload["notifications"])

    open_action = client.post(
        f"/notification-links/{patient_token}/inbox/{first_delivery['id']}/actions",
        json={"action": "open"},
    )
    assert open_action.status_code == 200
    assert open_action.json()["status"] == "opened"

    action_taken = client.post(
        f"/notification-links/{patient_token}/inbox/{first_delivery['id']}/actions",
        json={"action": "action_taken"},
    )
    assert action_taken.status_code == 200
    assert action_taken.json()["status"] == "action_taken"

    notification_timeline = client.get(
        f"/patients/{seeded.patient_id}/timeline-unified?categories=notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert notification_timeline.status_code == 200
    event_types = {event["event_type"] for event in notification_timeline.json()}
    assert "notification_queued" in event_types
    assert "notification_sent" in event_types
    assert "notification_delivered" in event_types
    assert "notification_opened" in event_types
    assert "notification_action_taken" in event_types


def test_notification_rules_frequency_and_silence_window(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Prompt10 Regras",
        email="prompt10.regras@cori.dev",
        password="prompt10regras",
        user_full_name="Dr. Regras",
        psychologist_display_name="Dr. Regras",
        patient_name="Paciente Regras",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    form = create_form_draft(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
    )
    patient_token = form["patient_access_token"]

    set_frequency = client.put(
        f"/patients/{seeded.patient_id}/notification-preferences",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "event_category": "all",
            "enabled": True,
            "inbox_enabled": True,
            "push_enabled": True,
            "realtime_enabled": True,
            "quiet_hours_start": None,
            "quiet_hours_end": None,
            "max_notifications_per_hour": 1,
        },
    )
    assert set_frequency.status_code == 200

    _first = share_document(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        document_id="doc-rate-1",
        document_title="Plano de crise",
    )
    _second = share_document(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        document_id="doc-rate-2",
        document_title="Plano de respiracao",
    )

    deliveries = client.get(
        f"/patients/{seeded.patient_id}/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert deliveries.status_code == 200
    payload = deliveries.json()
    status_by_doc = {
        item["metadata"].get("document_id"): item["status"]
        for item in payload
        if item["event_type"] == "document_shared"
    }
    assert status_by_doc["doc-rate-1"] == "delivered"
    assert status_by_doc["doc-rate-2"] == "failed"

    current_hour = datetime.now(UTC).hour
    set_silence = client.put(
        f"/notification-links/{patient_token}/preferences",
        json={
            "event_category": "all",
            "enabled": True,
            "inbox_enabled": True,
            "push_enabled": True,
            "realtime_enabled": True,
            "quiet_hours_start": current_hour,
            "quiet_hours_end": (current_hour + 1) % 24,
            "max_notifications_per_hour": 50,
        },
    )
    assert set_silence.status_code == 200

    _third = share_document(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        document_id="doc-silence-1",
        document_title="Diario cognitivo",
    )
    deliveries_after_silence = client.get(
        f"/patients/{seeded.patient_id}/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert deliveries_after_silence.status_code == 200
    latest_doc = next(
        item
        for item in deliveries_after_silence.json()
        if item["metadata"].get("document_id") == "doc-silence-1"
    )
    assert latest_doc["status"] == "failed"
    assert "silencio" in (latest_doc["status_reason"] or "")

    timeline_notifications = client.get(
        f"/patients/{seeded.patient_id}/timeline-unified?categories=notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline_notifications.status_code == 200
    event_types = {event["event_type"] for event in timeline_notifications.json()}
    assert "notification_failed" in event_types


def test_unified_timeline_filters_and_tenant_isolation(client, seed_tenant) -> None:
    tenant_a = seed_tenant(
        tenant_name="Tenant Prompt10 Timeline A",
        email="prompt10.timeline.a@cori.dev",
        password="prompt10a",
        user_full_name="Dra. Timeline A",
        psychologist_display_name="Dra. Timeline A",
        patient_name="Paciente Timeline A",
    )
    token_a = login_access_token(client, email=tenant_a.email, password=tenant_a.password)

    tenant_b = seed_tenant(
        tenant_name="Tenant Prompt10 Timeline B",
        email="prompt10.timeline.b@cori.dev",
        password="prompt10b",
        user_full_name="Dra. Timeline B",
        psychologist_display_name="Dra. Timeline B",
        patient_name="Paciente Timeline B",
    )
    token_b = login_access_token(client, email=tenant_b.email, password=tenant_b.password)

    activity = create_activity(
        client,
        access_token=token_a,
        patient_id=str(tenant_a.patient_id),
    )

    session_create = client.post(
        "/sessions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "patient_id": str(tenant_a.patient_id),
            "scheduled_start_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "scheduled_end_at": (datetime.now(UTC) + timedelta(days=1, minutes=50)).isoformat(),
            "location_mode": "online",
        },
    )
    assert session_create.status_code == 200

    form_create = create_form_draft(
        client,
        access_token=token_a,
        patient_id=str(tenant_a.patient_id),
    )
    send_form = client.post(
        f"/forms/{form_create['id']}/actions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"action": "publish"},
    )
    assert send_form.status_code == 200
    send_form = client.post(
        f"/forms/{form_create['id']}/actions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"action": "send"},
    )
    assert send_form.status_code == 200

    share_document(
        client,
        access_token=token_a,
        patient_id=str(tenant_a.patient_id),
        document_id="doc-timeline-1",
        document_title="Registro de gatilhos",
    )

    app_usage = client.get(f"/notification-links/{activity['patient_access_token']}/inbox")
    assert app_usage.status_code == 200

    only_activities = client.get(
        f"/patients/{tenant_a.patient_id}/timeline-unified?categories=activities",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert only_activities.status_code == 200
    assert len(only_activities.json()) >= 1
    assert {event["category"] for event in only_activities.json()} == {"activities"}

    only_documents = client.get(
        f"/patients/{tenant_a.patient_id}/timeline-unified?categories=documents",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert only_documents.status_code == 200
    assert any(event["event_type"] == "document_shared" for event in only_documents.json())
    assert {event["category"] for event in only_documents.json()} == {"documents"}

    only_notifications = client.get(
        f"/patients/{tenant_a.patient_id}/timeline-unified?categories=notifications",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert only_notifications.status_code == 200
    assert any(
        event["event_type"].startswith("notification_")
        for event in only_notifications.json()
    )

    only_app_usage = client.get(
        f"/patients/{tenant_a.patient_id}/timeline-unified?categories=app_usage",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert only_app_usage.status_code == 200
    assert any(event["event_type"] == "app_opened" for event in only_app_usage.json())

    cross_tenant = client.get(
        f"/patients/{tenant_a.patient_id}/timeline-unified",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert cross_tenant.status_code == 404

