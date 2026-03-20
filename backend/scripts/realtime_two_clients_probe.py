from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models import Patient, Psychologist, Tenant, User


@dataclass(frozen=True)
class SeededRealtimeContext:
    tenant_id: UUID
    patient_id: UUID
    email: str
    password: str


def _seed_realtime_context() -> SeededRealtimeContext:
    suffix = uuid4().hex[:8]
    email = f"realtime.probe.{suffix}@cori.dev"
    password = "realtimeProbe123"

    with SessionLocal() as db:
        db.execute(text("SET LOCAL ROLE cori_app"))
        db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))

        tenant = Tenant(name=f"Tenant Realtime Probe {suffix}")
        db.add(tenant)
        db.flush()

        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant.id)},
        )

        user = User(
            tenant_id=tenant.id,
            email=email,
            full_name="Dra. Realtime Probe",
            password_hash=hash_password(password),
        )
        db.add(user)
        db.flush()

        psychologist = Psychologist(
            tenant_id=tenant.id,
            user_id=user.id,
            display_name="Dra. Realtime Probe",
        )
        db.add(psychologist)
        db.flush()

        patient = Patient(
            tenant_id=tenant.id,
            full_name="Paciente Realtime Probe",
        )
        db.add(patient)
        db.flush()

        db.commit()
        return SeededRealtimeContext(
            tenant_id=tenant.id,
            patient_id=patient.id,
            email=email,
            password=password,
        )


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def run_probe() -> dict[str, object]:
    seeded = _seed_realtime_context()

    with TestClient(app) as client:
        login = client.post(
            "/auth/login",
            json={"email": seeded.email, "password": seeded.password},
        )
        if login.status_code != 200:
            raise RuntimeError(f"Falha login realtime probe: {login.status_code} {login.text}")
        access_token = login.json()["access_token"]

        anchor_activity = client.post(
            "/activities",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "patient_id": str(seeded.patient_id),
                "activity_type": "simple_task",
                "title": "Anchor realtime probe",
                "due_at": (datetime.now(UTC) + timedelta(days=3)).isoformat(),
            },
        )
        if anchor_activity.status_code != 200:
            raise RuntimeError(
                f"Falha anchor activity: {anchor_activity.status_code} {anchor_activity.text}"
            )
        patient_token = anchor_activity.json()["patient_access_token"]

        create_template = client.post(
            "/activity-templates",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "title": "Template probe realtime",
                "activity_type": "simple_task",
                "instructions": "Probe de entrega realtime",
            },
        )
        if create_template.status_code != 200:
            raise RuntimeError(
                "Falha create template: "
                f"{create_template.status_code} {create_template.text}"
            )
        template_id = create_template.json()["id"]

        with client.websocket_connect(f"/ws?token={access_token}") as ws_psychologist:
            with client.websocket_connect(f"/ws?patient_token={patient_token}") as ws_patient:
                ws_psychologist.receive_json()
                ws_patient.receive_json()

                ws_psychologist.send_json(
                    {
                        "type": "subscribe",
                        "channel": f"tenant:{seeded.tenant_id}",
                    }
                )

                request_sent_at = datetime.now(UTC)
                assign = client.post(
                    f"/activity-templates/{template_id}/assign",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Idempotency-Key": f"realtime-probe-{uuid4().hex}",
                    },
                    json={
                        "patient_id": str(seeded.patient_id),
                        "send_mode": "immediate",
                        "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
                    },
                )
                if assign.status_code != 200:
                    raise RuntimeError(
                        f"Falha assign realtime probe: {assign.status_code} {assign.text}"
                    )
                assigned_activity_id = assign.json()["activity"]["id"]

                psychologist_event = ws_psychologist.receive_json()
                psychologist_received_at = datetime.now(UTC)

                patient_event = ws_patient.receive_json()
                patient_received_at = datetime.now(UTC)

                emitted_at = _parse_iso(str(patient_event["created_at"]))
                psychologist_latency_ms = round(
                    (psychologist_received_at - emitted_at).total_seconds() * 1000,
                    2,
                )
                patient_latency_ms = round(
                    (patient_received_at - emitted_at).total_seconds() * 1000,
                    2,
                )

                return {
                    "tenant_id": str(seeded.tenant_id),
                    "patient_id": str(seeded.patient_id),
                    "activity_id": assigned_activity_id,
                    "request_sent_at": request_sent_at.isoformat(),
                    "event_emitted_at": emitted_at.isoformat(),
                    "psychologist_received_at": psychologist_received_at.isoformat(),
                    "patient_received_at": patient_received_at.isoformat(),
                    "psychologist_latency_ms": psychologist_latency_ms,
                    "patient_latency_ms": patient_latency_ms,
                    "psychologist_event": {
                        "event_type": psychologist_event.get("event_type"),
                        "entity_type": psychologist_event.get("entity_type"),
                        "entity_id": psychologist_event.get("entity_id"),
                        "patient_id": psychologist_event.get("patient_id"),
                        "tenant_id": psychologist_event.get("tenant_id"),
                    },
                    "patient_event": {
                        "event_type": patient_event.get("event_type"),
                        "entity_type": patient_event.get("entity_type"),
                        "entity_id": patient_event.get("entity_id"),
                        "patient_id": patient_event.get("patient_id"),
                        "tenant_id": patient_event.get("tenant_id"),
                    },
                }


if __name__ == "__main__":
    output = run_probe()
    print(json.dumps(output, ensure_ascii=True, indent=2))
