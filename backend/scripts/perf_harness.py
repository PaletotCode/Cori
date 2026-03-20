from __future__ import annotations

import argparse
import asyncio
import json
import random
import statistics
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import websockets


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * p
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    if lower == upper:
        return ordered[lower]
    fraction = rank - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _summarize_latencies(latencies_ms: list[float]) -> dict[str, float | int | None]:
    return {
        "count": len(latencies_ms),
        "min_ms": min(latencies_ms) if latencies_ms else None,
        "avg_ms": statistics.fmean(latencies_ms) if latencies_ms else None,
        "p50_ms": _percentile(latencies_ms, 0.50),
        "p90_ms": _percentile(latencies_ms, 0.90),
        "p95_ms": _percentile(latencies_ms, 0.95),
        "p99_ms": _percentile(latencies_ms, 0.99),
        "max_ms": max(latencies_ms) if latencies_ms else None,
    }


@dataclass(frozen=True)
class AuthContext:
    access_token: str
    tenant_id: str
    patient_id: str


async def _login_and_resolve_patient(
    client: httpx.AsyncClient,
    *,
    email: str,
    password: str,
) -> AuthContext:
    login = await client.post("/auth/login", json={"email": email, "password": password})
    login.raise_for_status()
    token = str(login.json()["access_token"])

    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    me.raise_for_status()
    tenant_id = str(me.json()["tenant_id"])

    patients = await client.get("/patients", headers={"Authorization": f"Bearer {token}"})
    patients.raise_for_status()
    payload = patients.json()
    if isinstance(payload, list) and payload:
        patient_id = str(payload[0]["id"])
        return AuthContext(access_token=token, tenant_id=tenant_id, patient_id=patient_id)

    created = await client.post(
        "/patients",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Paciente Perf Harness"},
    )
    created.raise_for_status()
    return AuthContext(
        access_token=token,
        tenant_id=tenant_id,
        patient_id=str(created.json()["id"]),
    )


async def _request_once(
    client: httpx.AsyncClient,
    *,
    auth: AuthContext,
    operation: str,
) -> tuple[str, bool, float]:
    headers = {"Authorization": f"Bearer {auth.access_token}"}
    started = time.perf_counter()
    ok = False
    try:
        if operation == "get_patients":
            response = await client.get("/patients", headers=headers)
        elif operation == "get_panel":
            response = await client.get("/panel/kpis?timezone=UTC", headers=headers)
        elif operation == "create_activity":
            due_at = (datetime.now(UTC) + timedelta(days=2)).isoformat()
            response = await client.post(
                "/activities",
                headers=headers,
                json={
                    "patient_id": auth.patient_id,
                    "activity_type": "simple_task",
                    "title": "Atividade carga/perf",
                    "due_at": due_at,
                },
            )
        elif operation == "create_form":
            response = await client.post(
                "/forms",
                headers=headers,
                json={
                    "patient_id": auth.patient_id,
                    "title": "Form carga/perf",
                    "sections": [
                        {
                            "title": "Estado atual",
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
        elif operation == "create_session":
            start_at = datetime.now(UTC) + timedelta(days=1, minutes=5)
            end_at = start_at + timedelta(minutes=50)
            response = await client.post(
                "/sessions",
                headers=headers,
                json={
                    "patient_id": auth.patient_id,
                    "scheduled_start_at": start_at.isoformat(),
                    "scheduled_end_at": end_at.isoformat(),
                    "location_mode": "online",
                },
            )
        else:
            raise ValueError(f"Operacao nao suportada: {operation}")
        ok = 200 <= response.status_code < 400
    except Exception:
        ok = False
    elapsed_ms = (time.perf_counter() - started) * 1000
    return operation, ok, elapsed_ms


async def _run_mixed_load(
    client: httpx.AsyncClient,
    *,
    auth: AuthContext,
    duration_seconds: int,
    concurrency: int,
) -> dict[str, Any]:
    operations = [
        ("get_patients", 0.35),
        ("get_panel", 0.20),
        ("create_activity", 0.20),
        ("create_form", 0.15),
        ("create_session", 0.10),
    ]
    labels = [item[0] for item in operations]
    weights = [item[1] for item in operations]
    latencies: dict[str, list[float]] = {label: [] for label in labels}
    total_requests = 0
    total_errors = 0
    lock = asyncio.Lock()
    start = time.perf_counter()
    stop_at = start + max(1, duration_seconds)

    async def worker() -> None:
        nonlocal total_requests, total_errors
        while time.perf_counter() < stop_at:
            chosen = random.choices(labels, weights=weights, k=1)[0]
            op, ok, elapsed_ms = await _request_once(client, auth=auth, operation=chosen)
            async with lock:
                total_requests += 1
                latencies[op].append(elapsed_ms)
                if not ok:
                    total_errors += 1

    await asyncio.gather(*(worker() for _ in range(max(1, concurrency))))
    elapsed = max(0.0001, time.perf_counter() - start)

    per_op = {label: _summarize_latencies(latencies[label]) for label in labels}
    aggregate = [value for group in latencies.values() for value in group]
    return {
        "started_at_utc": _utc_now_iso(),
        "duration_seconds": elapsed,
        "requested_duration_seconds": duration_seconds,
        "concurrency": concurrency,
        "total_requests": total_requests,
        "total_errors": total_errors,
        "error_rate_percent": (total_errors / total_requests * 100) if total_requests else 0.0,
        "throughput_rps": total_requests / elapsed,
        "latency_summary_ms": _summarize_latencies(aggregate),
        "per_operation": per_op,
    }


def _to_ws_url(base_url: str, token: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.startswith("https://"):
        return normalized.replace("https://", "wss://", 1) + f"/ws?token={token}"
    return normalized.replace("http://", "ws://", 1) + f"/ws?token={token}"


async def _run_realtime_probe(
    client: httpx.AsyncClient,
    *,
    auth: AuthContext,
    base_url: str,
    samples: int,
) -> dict[str, Any]:
    ws_url = _to_ws_url(base_url, auth.access_token)
    receive_latencies_ms: list[float] = []
    event_clock_latencies_ms: list[float] = []

    timeout_count = 0
    error_messages: list[str] = []
    headers = {"Authorization": f"Bearer {auth.access_token}"}
    created_patient = await client.post(
        "/patients",
        headers=headers,
        json={"full_name": "Paciente Perf Realtime"},
    )
    created_patient.raise_for_status()
    realtime_patient_id = str(created_patient.json()["id"])

    _ = await client.put(
        f"/patients/{realtime_patient_id}/notification-preferences",
        headers=headers,
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

    async with websockets.connect(ws_url, ping_interval=20, ping_timeout=20) as ws:
        await asyncio.wait_for(ws.recv(), timeout=10)  # connected
        await ws.send(
            json.dumps({"type": "subscribe", "channel": f"tenant:{auth.tenant_id}"})
        )
        for _ in range(max(1, samples)):
            started = time.perf_counter()
            try:
                response = await client.post(
                    "/activities",
                    headers=headers,
                    json={
                        "patient_id": realtime_patient_id,
                        "activity_type": "simple_task",
                        "title": "Atividade realtime probe",
                        "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
                    },
                )
                response.raise_for_status()
                raw = await asyncio.wait_for(ws.recv(), timeout=10)
                received_at = time.perf_counter()
                receive_latencies_ms.append((received_at - started) * 1000)

                message = json.loads(raw)
                created_at_raw = message.get("created_at")
                if isinstance(created_at_raw, str):
                    created_at = datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
                    now_utc = datetime.now(UTC)
                    event_clock_latencies_ms.append((now_utc - created_at).total_seconds() * 1000)
            except TimeoutError:
                timeout_count += 1
            except Exception as exc:
                error_messages.append(str(exc))

    return {
        "started_at_utc": _utc_now_iso(),
        "samples": max(1, samples),
        "timeouts": timeout_count,
        "errors": error_messages,
        "receive_latency_ms": _summarize_latencies(receive_latencies_ms),
        "event_clock_latency_ms": _summarize_latencies(event_clock_latencies_ms),
    }


async def _safe_realtime_probe(
    client: httpx.AsyncClient,
    *,
    auth: AuthContext,
    base_url: str,
    samples: int,
) -> dict[str, Any]:
    try:
        result = await _run_realtime_probe(
            client,
            auth=auth,
            base_url=base_url,
            samples=samples,
        )
        return {
            **result,
            "probe_failed": False,
        }
    except Exception as exc:
        return {
            "started_at_utc": _utc_now_iso(),
            "samples": max(1, samples),
            "timeouts": 0,
            "errors": [str(exc)],
            "receive_latency_ms": _summarize_latencies([]),
            "event_clock_latency_ms": _summarize_latencies([]),
            "probe_failed": True,
        }


async def run(args: argparse.Namespace) -> dict[str, Any]:
    timeout = httpx.Timeout(connect=5.0, read=20.0, write=20.0, pool=20.0)
    limits = httpx.Limits(max_keepalive_connections=200, max_connections=200)
    async with httpx.AsyncClient(
        base_url=args.base_url.rstrip("/"),
        timeout=timeout,
        limits=limits,
    ) as client:
        auth = await _login_and_resolve_patient(
            client,
            email=args.email,
            password=args.password,
        )

        if args.mode in {"baseline", "load", "soak"}:
            load_result = await _run_mixed_load(
                client,
                auth=auth,
                duration_seconds=args.duration_seconds,
                concurrency=args.concurrency,
            )
            realtime_result = await _safe_realtime_probe(
                client,
                auth=auth,
                base_url=args.base_url,
                samples=args.realtime_samples,
            )
            return {
                "mode": args.mode,
                "base_url": args.base_url,
                "auth_tenant_id": auth.tenant_id,
                "concurrency": args.concurrency,
                "duration_seconds": args.duration_seconds,
                "load_result": load_result,
                "realtime_result": realtime_result,
            }

        if args.mode == "stress":
            steps: list[int] = [
                int(chunk) for chunk in args.stress_steps.split(",") if chunk.strip()
            ]
            if not steps:
                raise ValueError("stress_steps vazio.")

            step_results: list[dict[str, Any]] = []
            for step_concurrency in steps:
                result = await _run_mixed_load(
                    client,
                    auth=auth,
                    duration_seconds=args.step_duration_seconds,
                    concurrency=step_concurrency,
                )
                step_results.append(result)
                if result["error_rate_percent"] > args.stress_stop_error_rate:
                    break

            realtime_result = await _safe_realtime_probe(
                client,
                auth=auth,
                base_url=args.base_url,
                samples=max(3, args.realtime_samples),
            )
            return {
                "mode": "stress",
                "base_url": args.base_url,
                "auth_tenant_id": auth.tenant_id,
                "stress_steps": steps,
                "step_duration_seconds": args.step_duration_seconds,
                "stop_error_rate_percent": args.stress_stop_error_rate,
                "step_results": step_results,
                "realtime_result": realtime_result,
            }

        raise ValueError(f"Modo invalido: {args.mode}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Harness de performance e realtime da API Cori")
    parser.add_argument("--mode", choices=["baseline", "load", "stress", "soak"], required=True)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", default="dr.aurora@cori.dev")
    parser.add_argument("--password", default="dev123456")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--duration-seconds", type=int, default=30)
    parser.add_argument("--realtime-samples", type=int, default=8)
    parser.add_argument("--stress-steps", default="10,20,40,80")
    parser.add_argument("--step-duration-seconds", type=int, default=20)
    parser.add_argument("--stress-stop-error-rate", type=float, default=3.0)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = asyncio.run(run(args))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
