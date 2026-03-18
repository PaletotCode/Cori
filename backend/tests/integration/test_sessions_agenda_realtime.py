from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.models import Session as ClinicalSession
from app.models import SessionReminder


def login_access_token(client, *, email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def create_session(
    client,
    *,
    access_token: str,
    patient_id: str,
    start_at: datetime,
    end_at: datetime,
) -> dict[str, object]:
    response = client.post(
        "/sessions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "patient_id": patient_id,
            "scheduled_start_at": start_at.isoformat(),
            "scheduled_end_at": end_at.isoformat(),
            "location_mode": "online",
            "notes": "Sessao inicial",
        },
    )
    assert response.status_code == 200
    return response.json()


def test_agenda_and_session_detail_flow(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Agenda Sessao",
        email="agenda.sessao@cori.dev",
        password="agenda123",
        user_full_name="Dra. Agenda",
        psychologist_display_name="Dra. Agenda",
        patient_name="Paciente Agenda",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    start_at = datetime.now(UTC) + timedelta(days=1, hours=2)
    end_at = start_at + timedelta(minutes=50)
    created = create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start_at,
        end_at=end_at,
    )
    assert created["status"] == "scheduled"
    assert "token=" in created["confirmation_link"]

    agenda = client.get(
        f"/agenda?view=week&reference_date={start_at.date().isoformat()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert agenda.status_code == 200
    agenda_payload = agenda.json()
    assert any(item["id"] == created["id"] for item in agenda_payload)

    detail = client.get(
        f"/sessions/{created['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["patient_id"] == str(seeded.patient_id)
    assert detail_payload["status"] == "scheduled"


def test_session_status_transitions_and_timeline(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Transition",
        email="transition@cori.dev",
        password="transition123",
        user_full_name="Dr. Transition",
        psychologist_display_name="Dr. Transition",
        patient_name="Paciente Transition",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    start_at = datetime.now(UTC) + timedelta(days=2)
    end_at = start_at + timedelta(minutes=50)
    created = create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start_at,
        end_at=end_at,
    )

    confirm = client.post(
        f"/sessions/{created['id']}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "confirm"},
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "confirmed"

    new_start = start_at + timedelta(days=1)
    new_end = new_start + timedelta(minutes=50)
    reschedule = client.post(
        f"/sessions/{created['id']}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "reschedule",
            "scheduled_start_at": new_start.isoformat(),
            "scheduled_end_at": new_end.isoformat(),
            "reason": "Ajuste de agenda da clinica.",
        },
    )
    assert reschedule.status_code == 200
    assert reschedule.json()["status"] == "rescheduled"

    cancel = client.post(
        f"/sessions/{created['id']}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "cancel",
            "reason": "Paciente solicitou cancelamento.",
        },
    )
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "canceled"

    invalid_confirm = client.post(
        f"/sessions/{created['id']}/actions",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "confirm"},
    )
    assert invalid_confirm.status_code == 409

    timeline = client.get(
        f"/sessions/{created['id']}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "session_created" in event_types
    assert "session_confirmed_by_psychologist" in event_types
    assert "session_rescheduled" in event_types
    assert "session_canceled" in event_types


def test_realtime_propagates_patient_confirmation(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Realtime",
        email="realtime@cori.dev",
        password="realtime123",
        user_full_name="Dra. Realtime",
        psychologist_display_name="Dra. Realtime",
        patient_name="Paciente Realtime",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    start_at = datetime.now(UTC) + timedelta(days=1, hours=3)
    end_at = start_at + timedelta(minutes=50)
    created = create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start_at,
        end_at=end_at,
    )
    confirmation_token = created["confirmation_token"]

    with client.websocket_connect(f"/ws?token={token}") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"

        websocket.send_json(
            {
                "type": "subscribe",
                "channel": f"tenant:{seeded.tenant_id}",
            }
        )

        confirm = client.post(
            f"/session-links/{confirmation_token}/sessions/{created['id']}/confirm",
        )
        assert confirm.status_code == 200
        assert confirm.json()["status"] == "confirmed"

        notification = websocket.receive_json()
        assert notification["type"] == "notification"
        assert notification["title"] == "Paciente confirmou presenca"


def test_scheduled_reminder_job_sends_due_entries(
    client,
    seed_tenant,
    session_factory,
) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Reminder",
        email="reminder@cori.dev",
        password="reminder123",
        user_full_name="Dr. Reminder",
        psychologist_display_name="Dr. Reminder",
        patient_name="Paciente Reminder",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    start_at = datetime.now(UTC) + timedelta(minutes=30)
    end_at = start_at + timedelta(minutes=50)
    created = create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start_at,
        end_at=end_at,
    )

    with session_factory() as db:
        db.execute(text("SET LOCAL ROLE cori_app"))
        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(seeded.tenant_id)},
        )
        session_row = db.scalar(select(ClinicalSession).where(ClinicalSession.id == created["id"]))
        assert session_row is not None
        reminders = list(
            db.scalars(
                select(SessionReminder).where(SessionReminder.session_id == session_row.id)
            ).all()
        )
        assert len(reminders) >= 1

    run_job = client.post(
        "/scheduler/session-reminders/run",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert run_job.status_code == 200
    payload = run_job.json()
    assert payload["processed"] >= 1
    assert payload["sent"] >= 1

    timeline = client.get(
        f"/sessions/{created['id']}/timeline-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline.status_code == 200
    event_types = {event["event_type"] for event in timeline.json()}
    assert "session_reminder_sent" in event_types
