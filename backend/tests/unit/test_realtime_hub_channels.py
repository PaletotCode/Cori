import asyncio
import json
from uuid import uuid4

from app.services.realtime_hub import RealtimeHub


class FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.messages: list[str] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, payload: str) -> None:
        self.messages.append(payload)


def _notification_payloads(messages: list[str]) -> list[dict[str, object]]:
    parsed: list[dict[str, object]] = []
    for raw in messages:
        payload = json.loads(raw)
        if payload.get("type") == "notification":
            parsed.append(payload)
    return parsed


def test_broadcast_routes_tenant_and_patient_channels() -> None:
    hub = RealtimeHub()

    async def _publish_noop(_: dict[str, object]) -> None:
        return None

    hub._publish_cross_instance = _publish_noop  # type: ignore[method-assign]

    tenant_id = uuid4()
    patient_a = uuid4()
    patient_b = uuid4()

    psychologist_ws = FakeWebSocket()
    patient_a_ws = FakeWebSocket()
    patient_b_ws = FakeWebSocket()

    asyncio.run(
        hub.connect(
            psychologist_ws,
            tenant_id=tenant_id,
            default_channels={f"tenant:{tenant_id}"},
            allowed_channels={f"tenant:{tenant_id}"},
        )
    )
    asyncio.run(
        hub.connect(
            patient_a_ws,
            tenant_id=tenant_id,
            default_channels={f"patient:{patient_a}"},
            allowed_channels={f"patient:{patient_a}"},
        )
    )
    asyncio.run(
        hub.connect(
            patient_b_ws,
            tenant_id=tenant_id,
            default_channels={f"patient:{patient_b}"},
            allowed_channels={f"patient:{patient_b}"},
        )
    )

    asyncio.run(
        hub.broadcast_notification(
            tenant_id=tenant_id,
            patient_id=patient_a,
            title="Titulo",
            body="Mensagem",
        )
    )

    psychologist_notifications = _notification_payloads(psychologist_ws.messages)
    patient_a_notifications = _notification_payloads(patient_a_ws.messages)
    patient_b_notifications = _notification_payloads(patient_b_ws.messages)

    assert len(psychologist_notifications) == 1
    assert len(patient_a_notifications) == 1
    assert len(patient_b_notifications) == 0
    assert psychologist_notifications[0]["patient_id"] == str(patient_a)


def test_subscribe_rejects_channel_outside_scope() -> None:
    hub = RealtimeHub()
    tenant_id = uuid4()

    allowed_patient_channel = f"patient:{uuid4()}"
    ws = FakeWebSocket()
    asyncio.run(
        hub.connect(
            ws,
            tenant_id=tenant_id,
            default_channels={allowed_patient_channel},
            allowed_channels={allowed_patient_channel},
        )
    )

    subscribed = asyncio.run(hub.subscribe(ws, channel=f"tenant:{tenant_id}"))
    assert subscribed is False
