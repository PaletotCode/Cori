import time
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, text

from app.models import Activity, NotificationDelivery, TimelineEvent


def login_access_token(client, *, email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_base_activity_token(
    client,
    *,
    access_token: str,
    patient_id: str,
    title: str,
) -> str:
    response = client.post(
        "/activities",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "patient_id": patient_id,
            "activity_type": "simple_task",
            "title": title,
            "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        },
    )
    assert response.status_code == 200
    return response.json()["patient_access_token"]


def test_activity_template_crud_assign_idempotency_and_scheduler(
    client,
    seed_tenant,
    session_factory,
) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Activity Templates",
        email="activity.templates@cori.dev",
        password="activity123",
        user_full_name="Dra. Activity",
        psychologist_display_name="Dra. Activity",
        patient_name="Paciente Activity",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    create_template = client.post(
        "/activity-templates",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Template rotina matinal",
            "activity_type": "simple_task",
            "instructions": "Executar checklist da manha.",
            "configuration": {"checklist": ["agua", "respiracao"]},
        },
    )
    assert create_template.status_code == 200
    template = create_template.json()

    list_templates = client.get(
        "/activity-templates",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_templates.status_code == 200
    assert any(item["id"] == template["id"] for item in list_templates.json())

    patch_template = client.patch(
        f"/activity-templates/{template['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Template rotina matinal v2"},
    )
    assert patch_template.status_code == 200
    assert patch_template.json()["title"] == "Template rotina matinal v2"

    immediate_due_at = datetime.now(UTC) + timedelta(days=4)
    assign_immediate = client.post(
        f"/activity-templates/{template['id']}/assign",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "activity-assign-immediate-001",
        },
        json={
            "patient_id": str(seeded.patient_id),
            "send_mode": "immediate",
            "due_at": immediate_due_at.isoformat(),
            "overrides": {
                "title": "Atividade personalizada",
                "instructions": "Seguir roteiro da sessao.",
            },
        },
    )
    assert assign_immediate.status_code == 200
    immediate_payload = assign_immediate.json()
    assert immediate_payload["idempotency_replayed"] is False
    assert immediate_payload["activity"]["status"] == "assigned"
    assert immediate_payload["activity"]["source_template_id"] == template["id"]

    replay_assign = client.post(
        f"/activity-templates/{template['id']}/assign",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "activity-assign-immediate-001",
        },
        json={
            "patient_id": str(seeded.patient_id),
            "send_mode": "immediate",
            "due_at": immediate_due_at.isoformat(),
            "overrides": {
                "title": "Atividade personalizada",
                "instructions": "Seguir roteiro da sessao.",
            },
        },
    )
    assert replay_assign.status_code == 200
    replay_payload = replay_assign.json()
    assert replay_payload["idempotency_replayed"] is True
    assert replay_payload["activity"]["id"] == immediate_payload["activity"]["id"]

    conflicting_retry = client.post(
        f"/activity-templates/{template['id']}/assign",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "activity-assign-immediate-001",
        },
        json={
            "patient_id": str(seeded.patient_id),
            "send_mode": "immediate",
            "due_at": (immediate_due_at + timedelta(days=1)).isoformat(),
        },
    )
    assert conflicting_retry.status_code == 409

    scheduled_send_at = datetime.now(UTC) + timedelta(seconds=1)
    assign_scheduled = client.post(
        f"/activity-templates/{template['id']}/assign",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "activity-assign-scheduled-001",
        },
        json={
            "patient_id": str(seeded.patient_id),
            "send_mode": "scheduled",
            "scheduled_send_at": scheduled_send_at.isoformat(),
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
        },
    )
    assert assign_scheduled.status_code == 200
    scheduled_payload = assign_scheduled.json()
    assert scheduled_payload["activity"]["status"] == "scheduled"
    time.sleep(5.2)

    dispatch_scheduled = client.post(
        "/scheduler/activities-dispatch/run",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dispatch_scheduled.status_code == 200
    assert dispatch_scheduled.json()["dispatched"] >= 1

    detail_scheduled = client.get(
        f"/activities/{scheduled_payload['activity']['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail_scheduled.status_code == 200
    assert detail_scheduled.json()["status"] == "assigned"

    timeline = client.get(
        f"/activities/{scheduled_payload['activity']['id']}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "scheduled" in event_types
    assert "assigned" in event_types

    notifications = client.get(
        f"/patients/{seeded.patient_id}/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert notifications.status_code == 200
    assigned_notifications = [
        item
        for item in notifications.json()
        if item["event_type"] == "activity_assigned"
        and item["metadata"].get("activity_id") == scheduled_payload["activity"]["id"]
    ]
    assert len(assigned_notifications) == 1
    assert assigned_notifications[0]["metadata"].get("send_mode") == "scheduled"

    with session_factory() as db:
        db.execute(text("SET LOCAL ROLE cori_app"))
        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(seeded.tenant_id)},
        )

        activity_row = db.scalar(
            select(Activity).where(Activity.id == UUID(scheduled_payload["activity"]["id"]))
        )
        assert activity_row is not None
        assert activity_row.source_template_id == UUID(template["id"])

        delivery_rows = list(
            db.scalars(
                select(NotificationDelivery).where(
                    NotificationDelivery.tenant_id == seeded.tenant_id,
                    NotificationDelivery.patient_id == seeded.patient_id,
                    NotificationDelivery.event_type == "activity_assigned",
                )
            ).all()
        )
        assert any(
            row.metadata_payload.get("activity_id") == scheduled_payload["activity"]["id"]
            for row in delivery_rows
        )

        timeline_rows = list(
            db.scalars(
                select(TimelineEvent).where(
                    TimelineEvent.tenant_id == seeded.tenant_id,
                    TimelineEvent.activity_id == UUID(scheduled_payload["activity"]["id"]),
                )
            ).all()
        )
        assert any(event.event_type == "scheduled" for event in timeline_rows)
        assert any(event.event_type == "assigned" for event in timeline_rows)


def test_form_template_assign_and_instance_edit_does_not_mutate_template(
    client,
    seed_tenant,
) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Form Templates",
        email="form.templates@cori.dev",
        password="form12345",
        user_full_name="Dr. Form",
        psychologist_display_name="Dr. Form",
        patient_name="Paciente Form",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    create_template = client.post(
        "/form-templates",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Template de revisao semanal",
            "subtitle": "Ritmo emocional",
            "header": "Responder com sinceridade.",
            "sections": [
                {
                    "title": "Estado atual",
                    "questions": [
                        {
                            "label": "Como voce se sente hoje?",
                            "field_type": "short_text",
                            "required": True,
                        }
                    ],
                }
            ],
        },
    )
    assert create_template.status_code == 200
    template = create_template.json()

    assign_immediate = client.post(
        f"/form-templates/{template['id']}/assign",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "form-assign-immediate-001",
        },
        json={
            "patient_id": str(seeded.patient_id),
            "send_mode": "immediate",
            "overrides": {
                "title": "Formulario adaptado da semana",
            },
        },
    )
    assert assign_immediate.status_code == 200
    immediate_payload = assign_immediate.json()
    assert immediate_payload["idempotency_replayed"] is False
    assert immediate_payload["form"]["status"] == "assigned"
    assert immediate_payload["form"]["source_template_id"] == template["id"]

    scheduled_send_at = datetime.now(UTC) + timedelta(seconds=1)
    assign_scheduled = client.post(
        f"/form-templates/{template['id']}/assign",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "form-assign-scheduled-001",
        },
        json={
            "patient_id": str(seeded.patient_id),
            "send_mode": "scheduled",
            "scheduled_send_at": scheduled_send_at.isoformat(),
        },
    )
    assert assign_scheduled.status_code == 200
    scheduled_payload = assign_scheduled.json()
    assert scheduled_payload["form"]["status"] == "scheduled"

    update_scheduled_instance = client.patch(
        f"/forms/{scheduled_payload['form']['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Formulario da semana - versao editada"},
    )
    assert update_scheduled_instance.status_code == 200
    assert update_scheduled_instance.json()["title"] == "Formulario da semana - versao editada"

    template_detail = client.get(
        f"/form-templates/{template['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert template_detail.status_code == 200
    assert template_detail.json()["title"] == "Template de revisao semanal"

    time.sleep(1.3)

    dispatch = client.post(
        "/scheduler/forms-dispatch/run",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dispatch.status_code == 200
    assert dispatch.json()["dispatched"] >= 1

    form_detail = client.get(
        f"/forms/{scheduled_payload['form']['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert form_detail.status_code == 200
    assert form_detail.json()["status"] == "assigned"

    timeline = client.get(
        f"/forms/{scheduled_payload['form']['id']}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "scheduled" in event_types
    assert "assigned" in event_types


def test_realtime_two_clients_targeted_delivery_and_payload_contract(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Realtime Templates",
        email="realtime.templates@cori.dev",
        password="realtime123",
        user_full_name="Dra. Live",
        psychologist_display_name="Dra. Live",
        patient_name="Paciente Live A",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    create_second_patient = client.post(
        "/patients",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Paciente Live B"},
    )
    assert create_second_patient.status_code == 200
    second_patient_id = create_second_patient.json()["id"]

    patient_token_a = create_base_activity_token(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        title="Anchor paciente A",
    )
    patient_token_b = create_base_activity_token(
        client,
        access_token=token,
        patient_id=second_patient_id,
        title="Anchor paciente B",
    )

    create_template = client.post(
        "/activity-templates",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Template realtime",
            "activity_type": "simple_task",
            "instructions": "Executar imediatamente.",
        },
    )
    assert create_template.status_code == 200
    template = create_template.json()

    with client.websocket_connect(f"/ws?token={token}") as psychologist_ws:
        with client.websocket_connect(f"/ws?patient_token={patient_token_a}") as patient_a_ws:
            with client.websocket_connect(f"/ws?patient_token={patient_token_b}") as patient_b_ws:
                assert psychologist_ws.receive_json()["type"] == "connected"
                assert patient_a_ws.receive_json()["type"] == "connected"
                assert patient_b_ws.receive_json()["type"] == "connected"

                psychologist_ws.send_json(
                    {
                        "type": "subscribe",
                        "channel": f"tenant:{seeded.tenant_id}",
                    }
                )

                assign_a = client.post(
                    f"/activity-templates/{template['id']}/assign",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Idempotency-Key": "realtime-assign-a-001",
                    },
                    json={
                        "patient_id": str(seeded.patient_id),
                        "send_mode": "immediate",
                        "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                    },
                )
                assert assign_a.status_code == 200
                assigned_activity_a = assign_a.json()["activity"]["id"]

                psychologist_event_a = psychologist_ws.receive_json()
                patient_event_a = patient_a_ws.receive_json()

                assert psychologist_event_a["type"] == "notification"
                assert patient_event_a["type"] == "notification"
                assert patient_event_a["event_type"] == "activity_assigned"
                assert patient_event_a["entity_type"] == "activity"
                assert patient_event_a["entity_id"] == assigned_activity_a
                assert patient_event_a["patient_id"] == str(seeded.patient_id)
                assert patient_event_a["tenant_id"] == str(seeded.tenant_id)
                assert isinstance(patient_event_a["title"], str)
                assert len(patient_event_a["title"]) > 0
                assert isinstance(patient_event_a["body"], str)
                assert len(patient_event_a["body"]) > 0
                assert isinstance(patient_event_a["created_at"], str)
                assert patient_event_a["metadata"].get("source_template_id") == template["id"]
                assert patient_event_a["metadata"].get("send_mode") == "immediate"

                assign_b = client.post(
                    f"/activity-templates/{template['id']}/assign",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Idempotency-Key": "realtime-assign-b-001",
                    },
                    json={
                        "patient_id": second_patient_id,
                        "send_mode": "immediate",
                        "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                    },
                )
                assert assign_b.status_code == 200

                psychologist_event_b = psychologist_ws.receive_json()
                patient_event_b = patient_b_ws.receive_json()
                assert psychologist_event_b["type"] == "notification"
                assert patient_event_b["patient_id"] == second_patient_id

                patient_a_ws.send_json({"type": "ping"})
                assert patient_a_ws.receive_json()["type"] == "pong"


def test_legacy_session_activity_and_form_endpoints_still_work(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Legacy Compatibility",
        email="legacy.compat@cori.dev",
        password="legacy123",
        user_full_name="Dra. Legacy",
        psychologist_display_name="Dra. Legacy",
        patient_name="Paciente Legacy",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    create_session = client.post(
        "/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "patient_id": str(seeded.patient_id),
            "scheduled_start_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "scheduled_end_at": (datetime.now(UTC) + timedelta(days=1, minutes=50)).isoformat(),
            "location_mode": "online",
        },
    )
    assert create_session.status_code == 200
    assert create_session.json()["status"] == "scheduled"

    create_activity = client.post(
        "/activities",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "patient_id": str(seeded.patient_id),
            "activity_type": "simple_task",
            "title": "Atividade legado",
            "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        },
    )
    assert create_activity.status_code == 200
    assert create_activity.json()["status"] == "assigned"
    assert create_activity.json()["source_template_id"] is None

    create_form = client.post(
        "/forms",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "patient_id": str(seeded.patient_id),
            "title": "Formulario legado",
            "sections": [
                {
                    "title": "Secao legado",
                    "questions": [
                        {
                            "label": "Como foi a semana?",
                            "field_type": "short_text",
                            "required": True,
                        }
                    ],
                }
            ],
        },
    )
    assert create_form.status_code == 200

    publish_form = client.post(
        f"/forms/{create_form.json()['id']}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "publish"},
    )
    assert publish_form.status_code == 200

    send_form = client.post(
        f"/forms/{create_form.json()['id']}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "send"},
    )
    assert send_form.status_code == 200
    assert send_form.json()["status"] == "assigned"
    assert send_form.json()["source_template_id"] is None
