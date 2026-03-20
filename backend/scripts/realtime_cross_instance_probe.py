from __future__ import annotations

import argparse
import asyncio
import json
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import websockets


def _ws_url(base_http: str, token: str) -> str:
    return base_http.replace("http://", "ws://", 1).rstrip("/") + f"/ws?token={token}"


async def run_probe(
    *,
    api_a: str,
    api_b: str,
    email: str,
    password: str,
) -> dict[str, Any]:
    timeout = httpx.Timeout(connect=5.0, read=20.0, write=20.0, pool=20.0)
    async with httpx.AsyncClient(base_url=api_a, timeout=timeout) as client_a, httpx.AsyncClient(
        base_url=api_b,
        timeout=timeout,
    ) as client_b:
        login = await client_a.post("/auth/login", json={"email": email, "password": password})
        login.raise_for_status()
        token = str(login.json()["access_token"])

        me = await client_a.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        me.raise_for_status()
        tenant_id = str(me.json()["tenant_id"])

        created_patient = await client_a.post(
            "/patients",
            headers={"Authorization": f"Bearer {token}"},
            json={"full_name": "Paciente Cross Instance Realtime"},
        )
        created_patient.raise_for_status()
        patient_id = str(created_patient.json()["id"])

        prefs = await client_a.put(
            f"/patients/{patient_id}/notification-preferences",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "event_category": "all",
                "enabled": True,
                "inbox_enabled": True,
                "push_enabled": True,
                "realtime_enabled": True,
                "quiet_hours_start": None,
                "quiet_hours_end": None,
                "max_notifications_per_hour": 120,
            },
        )
        prefs.raise_for_status()

        ws = await websockets.connect(_ws_url(api_a, token), ping_interval=20, ping_timeout=20)
        try:
            connected_raw = await asyncio.wait_for(ws.recv(), timeout=10)
            await ws.send(json.dumps({"type": "subscribe", "channel": f"tenant:{tenant_id}"}))

            started = time.perf_counter()
            create_activity = await client_b.post(
                "/activities",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "patient_id": patient_id,
                    "activity_type": "simple_task",
                    "title": "Probe cross-instance",
                    "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
                },
            )
            create_activity.raise_for_status()

            received_raw = await asyncio.wait_for(ws.recv(), timeout=15)
            elapsed_ms = (time.perf_counter() - started) * 1000
            message = json.loads(received_raw)

            created_at = datetime.fromisoformat(str(message["created_at"]).replace("Z", "+00:00"))
            clock_lag_ms = (datetime.now(UTC) - created_at).total_seconds() * 1000
            success = (
                message.get("type") == "notification"
                and message.get("patient_id") == patient_id
            )

            return {
                "probe": "realtime_cross_instance",
                "started_at_utc": datetime.now(UTC).isoformat(),
                "api_a": api_a,
                "api_b": api_b,
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "subscription_channel": f"tenant:{tenant_id}",
                "connected_payload": json.loads(connected_raw),
                "trigger_response_status": create_activity.status_code,
                "trigger_activity_id": create_activity.json().get("id"),
                "received_message": message,
                "receive_latency_ms": elapsed_ms,
                "event_clock_lag_ms": clock_lag_ms,
                "success": success,
            }
        finally:
            await ws.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Probe de entrega realtime cross-instance")
    parser.add_argument("--api-a", default="http://localhost:8000")
    parser.add_argument("--api-b", default="http://localhost:8001")
    parser.add_argument("--email", default="dr.aurora@cori.dev")
    parser.add_argument("--password", default="dev123456")
    parser.add_argument(
        "--output",
        default="artifacts/perf/realtime/realtime_cross_instance_probe.json",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = asyncio.run(
        run_probe(
            api_a=args.api_a,
            api_b=args.api_b,
            email=args.email,
            password=args.password,
        )
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
