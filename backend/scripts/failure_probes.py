from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import websockets

from app.worker.job_queue import job_queue


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _run(cmd: list[str]) -> dict[str, Any]:
    started = time.perf_counter()
    completed = subprocess.run(cmd, check=True, capture_output=True, text=True)
    duration_ms = (time.perf_counter() - started) * 1000
    return {
        "cmd": " ".join(cmd),
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
        "duration_ms": duration_ms,
    }


def _health_status(base_url: str) -> dict[str, Any]:
    try:
        response = httpx.get(f"{base_url.rstrip('/')}/health", timeout=5.0)
        payload = response.json()
        return {
            "http_status": response.status_code,
            "payload": payload,
        }
    except Exception as exc:
        return {
            "http_status": None,
            "error": str(exc),
        }


def _wait_for_health(
    base_url: str,
    *,
    expected_status: int,
    timeout_seconds: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    attempts: list[dict[str, Any]] = []
    while (time.perf_counter() - started) <= max(1, timeout_seconds):
        status = _health_status(base_url)
        attempts.append(status)
        if status.get("http_status") == expected_status:
            return {
                "matched": True,
                "attempts": attempts,
                "elapsed_seconds": time.perf_counter() - started,
            }
        time.sleep(1)

    return {
        "matched": False,
        "attempts": attempts,
        "elapsed_seconds": time.perf_counter() - started,
    }


def _job_presence(job_id: str) -> dict[str, bool]:
    ready_items = job_queue._redis.lrange(job_queue._ready_key, 0, -1)
    processing_items = job_queue._redis.lrange(job_queue._processing_key, 0, -1)
    retry_items = job_queue._redis.zrange(job_queue._retry_key, 0, -1)
    dead_items = job_queue._redis.lrange(job_queue._dead_key, 0, -1)

    marker = f'"job_id":"{job_id}"'
    return {
        "ready": any(marker in raw for raw in ready_items),
        "processing": any(marker in raw for raw in processing_items),
        "retry": any(marker in raw for raw in retry_items),
        "dead": any(marker in raw for raw in dead_items),
    }


def probe_worker_recovery(*, timeout_seconds: int) -> dict[str, Any]:
    trace_id = f"failure-worker-{int(time.time())}"
    before_depth = job_queue.queue_depth()

    enqueue = job_queue.enqueue(
        job_type="scheduler.activities_overdue",
        payload={},
        idempotency_key=trace_id,
        max_attempts=3,
        trace_id=trace_id,
    )

    stopped = _run(["docker", "stop", "cori-worker"])
    time.sleep(3)
    down_depth = job_queue.queue_depth()
    down_presence = _job_presence(enqueue.job_id)

    started = _run(["docker", "start", "cori-worker"])

    seen_states: list[dict[str, Any]] = []
    recovered = False
    started_wait = time.perf_counter()
    while (time.perf_counter() - started_wait) <= max(1, timeout_seconds):
        presence = _job_presence(enqueue.job_id)
        depth = job_queue.queue_depth()
        snapshot = {
            "at_utc": _utc_now_iso(),
            "presence": presence,
            "depth": depth,
        }
        seen_states.append(snapshot)
        if not any(presence.values()):
            recovered = True
            break
        time.sleep(2)

    final_depth = job_queue.queue_depth()

    return {
        "probe": "worker_recovery",
        "started_at_utc": _utc_now_iso(),
        "job_id": enqueue.job_id,
        "job_replayed": enqueue.replayed,
        "depth_before": before_depth,
        "stop_worker": stopped,
        "depth_while_down": down_depth,
        "presence_while_down": down_presence,
        "start_worker": started,
        "observed_states": seen_states,
        "depth_after": final_depth,
        "recovered": recovered,
    }


async def _realtime_delivery_check(base_url: str, *, email: str, password: str) -> dict[str, Any]:
    timeout = httpx.Timeout(connect=5.0, read=15.0, write=15.0, pool=15.0)
    async with httpx.AsyncClient(base_url=base_url, timeout=timeout) as client:
        login = await client.post("/auth/login", json={"email": email, "password": password})
        login.raise_for_status()
        token = str(login.json()["access_token"])

        me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        me.raise_for_status()
        tenant_id = str(me.json()["tenant_id"])

        created = await client.post(
            "/patients",
            headers={"Authorization": f"Bearer {token}"},
            json={"full_name": "Paciente Failure Probe"},
        )
        created.raise_for_status()
        patient_id = str(created.json()["id"])

        _ = await client.put(
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

        ws_url = base_url.replace("http://", "ws://", 1).rstrip("/") + f"/ws?token={token}"
        ws = await websockets.connect(ws_url, ping_interval=20, ping_timeout=20)
        try:
            await asyncio.wait_for(ws.recv(), timeout=10)
            await ws.send(json.dumps({"type": "subscribe", "channel": f"tenant:{tenant_id}"}))

            started = time.perf_counter()
            trigger = await client.post(
                "/activities",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "patient_id": patient_id,
                    "activity_type": "simple_task",
                    "title": "Failure Probe Activity",
                    "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
                },
            )
            trigger.raise_for_status()
            raw = await asyncio.wait_for(ws.recv(), timeout=12)
            elapsed_ms = (time.perf_counter() - started) * 1000
            payload = json.loads(raw)
            return {
                "success": (
                    payload.get("type") == "notification"
                    and payload.get("patient_id") == patient_id
                ),
                "receive_latency_ms": elapsed_ms,
                "message": payload,
                "activity_id": trigger.json().get("id"),
            }
        finally:
            await ws.close()


def probe_redis_recovery(
    *,
    base_url: str,
    email: str,
    password: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    before = _health_status(base_url)

    stop = _run(["docker", "stop", "cori-redis"])
    degraded_wait = _wait_for_health(base_url, expected_status=503, timeout_seconds=timeout_seconds)

    start = _run(["docker", "start", "cori-redis"])
    recovered_wait = _wait_for_health(
        base_url,
        expected_status=200,
        timeout_seconds=timeout_seconds,
    )

    realtime_check: dict[str, Any]
    try:
        realtime_check = asyncio.run(
            _realtime_delivery_check(base_url, email=email, password=password)
        )
    except Exception as exc:
        realtime_check = {
            "success": False,
            "error": str(exc),
        }

    return {
        "probe": "redis_recovery",
        "started_at_utc": _utc_now_iso(),
        "health_before": before,
        "stop_redis": stop,
        "wait_degraded": degraded_wait,
        "start_redis": start,
        "wait_recovered": recovered_wait,
        "realtime_after_recovery": realtime_check,
        "success": bool(
            degraded_wait.get("matched")
            and recovered_wait.get("matched")
            and realtime_check.get("success")
        ),
    }


def probe_database_recovery(
    *,
    base_url: str,
    email: str,
    password: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    before = _health_status(base_url)

    stop = _run(["docker", "stop", "cori-postgres"])
    degraded_wait = _wait_for_health(base_url, expected_status=503, timeout_seconds=timeout_seconds)

    start = _run(["docker", "start", "cori-postgres"])
    recovered_wait = _wait_for_health(
        base_url,
        expected_status=200,
        timeout_seconds=timeout_seconds,
    )

    auth_check: dict[str, Any]
    try:
        response = httpx.post(
            f"{base_url.rstrip('/')}/auth/login",
            timeout=15.0,
            json={"email": email, "password": password},
        )
        auth_check = {
            "http_status": response.status_code,
            "ok": response.status_code == 200,
        }
    except Exception as exc:
        auth_check = {
            "http_status": None,
            "ok": False,
            "error": str(exc),
        }

    return {
        "probe": "database_recovery",
        "started_at_utc": _utc_now_iso(),
        "health_before": before,
        "stop_database": stop,
        "wait_degraded": degraded_wait,
        "start_database": start,
        "wait_recovered": recovered_wait,
        "auth_after_recovery": auth_check,
        "success": bool(
            degraded_wait.get("matched")
            and recovered_wait.get("matched")
            and auth_check.get("ok")
        ),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Failure probes de resiliencia")
    parser.add_argument(
        "--mode",
        choices=["worker", "redis", "database"],
        required=True,
    )
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", default="dr.aurora@cori.dev")
    parser.add_argument("--password", default="dev123456")
    parser.add_argument("--timeout-seconds", type=int, default=90)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.mode == "worker":
        result = probe_worker_recovery(timeout_seconds=args.timeout_seconds)
    elif args.mode == "redis":
        result = probe_redis_recovery(
            base_url=args.base_url,
            email=args.email,
            password=args.password,
            timeout_seconds=args.timeout_seconds,
        )
    else:
        result = probe_database_recovery(
            base_url=args.base_url,
            email=args.email,
            password=args.password,
            timeout_seconds=args.timeout_seconds,
        )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
