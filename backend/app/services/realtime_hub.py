import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

from fastapi import WebSocket
from redis.asyncio import Redis as AsyncRedis
from redis.asyncio.client import PubSub

from app.core.config import settings
from app.core.redis_client import redis_client

logger = logging.getLogger("cori-realtime")


class RealtimeHub:
    def __init__(self) -> None:
        self._connections_by_tenant: dict[UUID, set[WebSocket]] = {}
        self._connection_tenant: dict[WebSocket, UUID] = {}
        self._subscriptions: dict[WebSocket, set[str]] = {}
        self._allowed_channels: dict[WebSocket, set[str]] = {}

        self._instance_id = uuid4().hex
        self._channel = settings.realtime_pubsub_channel
        self._pubsub_task: asyncio.Task[None] | None = None
        self._async_redis: AsyncRedis | None = None
        self._pubsub: PubSub | None = None
        self._publish_failures = 0
        self._publish_circuit_open_until = 0.0

    async def start(self) -> None:
        if self._pubsub_task is not None:
            return

        if self._channel.strip() == "":
            logger.info("realtime_pubsub_disabled reason=empty_channel")
            return

        try:
            redis = AsyncRedis.from_url(settings.redis_url, decode_responses=True)
            await redis.ping()
            pubsub = redis.pubsub(ignore_subscribe_messages=True)
            await pubsub.subscribe(self._channel)

            self._async_redis = redis
            self._pubsub = pubsub
            self._pubsub_task = asyncio.create_task(self._consume_pubsub(), name="realtime-pubsub")
            logger.info(
                "realtime_pubsub_started channel=%s instance=%s",
                self._channel,
                self._instance_id,
            )
        except Exception as exc:
            logger.warning("realtime_pubsub_start_failed channel=%s error=%s", self._channel, exc)
            await self._safe_close_pubsub()

    async def stop(self) -> None:
        if self._pubsub_task is not None:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
            self._pubsub_task = None

        await self._safe_close_pubsub()

        if self._async_redis is not None:
            await self._async_redis.aclose()
            self._async_redis = None

    async def _safe_close_pubsub(self) -> None:
        if self._pubsub is None:
            return
        try:
            await self._pubsub.unsubscribe(self._channel)
        except Exception:
            pass
        try:
            await self._pubsub.aclose()
        except Exception:
            pass
        self._pubsub = None

    async def _consume_pubsub(self) -> None:
        assert self._pubsub is not None

        while True:
            try:
                message = await self._pubsub.get_message(timeout=1.0)
                if message is None:
                    await asyncio.sleep(0.05)
                    continue

                raw_data = message.get("data")
                if not isinstance(raw_data, str) or raw_data.strip() == "":
                    continue

                envelope = json.loads(raw_data)
                origin = str(envelope.get("origin") or "")
                if origin == self._instance_id:
                    continue
                await self._broadcast_envelope(envelope)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("realtime_pubsub_consume_error error=%s", exc)
                await asyncio.sleep(0.25)

    async def connect(
        self,
        websocket: WebSocket,
        *,
        tenant_id: UUID,
        default_channels: set[str],
        allowed_channels: set[str],
    ) -> None:
        await websocket.accept()
        self._connections_by_tenant.setdefault(tenant_id, set()).add(websocket)
        self._connection_tenant[websocket] = tenant_id
        self._subscriptions[websocket] = set(default_channels)
        self._allowed_channels[websocket] = set(allowed_channels)

        await websocket.send_text(
            json.dumps(
                {
                    "type": "connected",
                    "at": datetime.now(UTC).isoformat(),
                    "channels": sorted(self._subscriptions[websocket]),
                }
            )
        )

    def disconnect(self, websocket: WebSocket, *, tenant_id: UUID | None = None) -> None:
        resolved_tenant_id = tenant_id or self._connection_tenant.get(websocket)
        if resolved_tenant_id is not None:
            sockets = self._connections_by_tenant.get(resolved_tenant_id)
            if sockets is not None:
                sockets.discard(websocket)
                if len(sockets) == 0:
                    self._connections_by_tenant.pop(resolved_tenant_id, None)

        self._connection_tenant.pop(websocket, None)
        self._subscriptions.pop(websocket, None)
        self._allowed_channels.pop(websocket, None)

    async def subscribe(self, websocket: WebSocket, *, channel: str) -> bool:
        allowed = self._allowed_channels.get(websocket, set())
        if channel not in allowed:
            return False

        subscriptions = self._subscriptions.setdefault(websocket, set())
        subscriptions.add(channel)
        return True

    async def send_pong(self, websocket: WebSocket) -> None:
        await websocket.send_text(json.dumps({"type": "pong"}))

    async def send_error(self, websocket: WebSocket, *, message: str) -> None:
        await websocket.send_text(json.dumps({"type": "error", "message": message}))

    async def broadcast_notification(
        self,
        *,
        tenant_id: UUID,
        title: str,
        body: str,
        notification_id: UUID | None = None,
        patient_id: UUID | None = None,
        status: str | None = None,
        category: str | None = None,
        event_type: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        metadata: dict[str, object] | None = None,
        created_at: datetime | None = None,
    ) -> None:
        envelope: dict[str, object] = {
            "origin": self._instance_id,
            "type": "notification",
            "id": str(notification_id or uuid4()),
            "title": title,
            "body": body,
            "created_at": (created_at or datetime.now(UTC)).isoformat(),
            "tenant_id": str(tenant_id),
            "patient_id": str(patient_id) if patient_id is not None else None,
            "status": status,
            "category": category,
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "metadata": cast(dict[str, object], metadata or {}),
        }

        await self._broadcast_envelope(envelope)
        await self._publish_cross_instance(envelope)

    async def _publish_cross_instance(self, envelope: dict[str, object]) -> None:
        if self._channel.strip() == "":
            return

        now_epoch = asyncio.get_running_loop().time()
        if now_epoch < self._publish_circuit_open_until:
            return

        payload = json.dumps(envelope, separators=(",", ":"), sort_keys=True)

        try:
            await asyncio.to_thread(redis_client.publish, self._channel, payload)
            self._publish_failures = 0
        except Exception as exc:
            self._publish_failures += 1
            if (
                self._publish_failures
                >= settings.realtime_publish_circuit_failures_threshold
            ):
                self._publish_circuit_open_until = (
                    now_epoch + settings.realtime_publish_circuit_cooldown_seconds
                )
                self._publish_failures = 0
            logger.warning("realtime_pubsub_publish_failed channel=%s error=%s", self._channel, exc)

    async def _broadcast_envelope(self, envelope: dict[str, object]) -> None:
        tenant_raw = envelope.get("tenant_id")
        if not isinstance(tenant_raw, str):
            return

        try:
            tenant_id = UUID(tenant_raw)
        except ValueError:
            return

        sockets = list(self._connections_by_tenant.get(tenant_id, set()))
        if len(sockets) == 0:
            return

        patient_raw = envelope.get("patient_id")
        tenant_channel = f"tenant:{tenant_id}"
        target_channels = {tenant_channel}
        if isinstance(patient_raw, str) and patient_raw.strip() != "":
            target_channels.add(f"patient:{patient_raw}")

        payload = json.dumps(
            {
                "type": str(envelope.get("type") or "notification"),
                "id": str(envelope.get("id") or uuid4()),
                "title": str(envelope.get("title") or ""),
                "body": str(envelope.get("body") or ""),
                "created_at": str(envelope.get("created_at") or datetime.now(UTC).isoformat()),
                "tenant_id": tenant_raw,
                "patient_id": patient_raw,
                "status": envelope.get("status"),
                "category": envelope.get("category"),
                "event_type": envelope.get("event_type"),
                "entity_type": envelope.get("entity_type"),
                "entity_id": envelope.get("entity_id"),
                "metadata": (
                    envelope.get("metadata")
                    if isinstance(envelope.get("metadata"), dict)
                    else {}
                ),
            }
        )

        stale: list[WebSocket] = []
        for socket in sockets:
            subscriptions = self._subscriptions.get(socket, set())
            if len(subscriptions.intersection(target_channels)) == 0:
                continue
            try:
                await socket.send_text(payload)
            except RuntimeError:
                stale.append(socket)
            except Exception:
                stale.append(socket)

        for socket in stale:
            self.disconnect(socket, tenant_id=tenant_id)


realtime_hub = RealtimeHub()
