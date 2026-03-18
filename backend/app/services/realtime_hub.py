import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import WebSocket


class RealtimeHub:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, *, tenant_id: UUID) -> None:
        await websocket.accept()
        self._connections.setdefault(tenant_id, set()).add(websocket)
        await websocket.send_text(
            json.dumps(
                {
                    "type": "connected",
                    "at": datetime.now(UTC).isoformat(),
                }
            )
        )

    def disconnect(self, websocket: WebSocket, *, tenant_id: UUID) -> None:
        sockets = self._connections.get(tenant_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if len(sockets) == 0:
            self._connections.pop(tenant_id, None)

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
    ) -> None:
        sockets = list(self._connections.get(tenant_id, set()))
        if len(sockets) == 0:
            return

        notification_uuid = notification_id or uuid4()
        payload = json.dumps(
            {
                "type": "notification",
                "id": str(notification_uuid),
                "title": title,
                "body": body,
                "created_at": datetime.now(UTC).isoformat(),
                "patient_id": str(patient_id) if patient_id is not None else None,
                "status": status,
                "category": category,
                "event_type": event_type,
            }
        )

        stale: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_text(payload)
            except RuntimeError:
                stale.append(socket)
            except Exception:
                stale.append(socket)

        for socket in stale:
            self.disconnect(socket, tenant_id=tenant_id)


realtime_hub = RealtimeHub()
