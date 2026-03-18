import json
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import TokenType, TokenValidationError, decode_token
from app.services.realtime_hub import realtime_hub

router = APIRouter(tags=["realtime"])


def _extract_tenant_id(token: str | None) -> UUID:
    if token is None or token.strip() == "":
        raise TokenValidationError("Token de acesso ausente para realtime.")
    token_data = decode_token(token.strip(), expected_type=TokenType.ACCESS)
    return token_data.tenant_id


@router.websocket("/ws")
async def websocket_realtime(websocket: WebSocket) -> None:
    try:
        tenant_id = _extract_tenant_id(websocket.query_params.get("token"))
    except TokenValidationError:
        await websocket.close(code=4401)
        return

    await realtime_hub.connect(websocket, tenant_id=tenant_id)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await realtime_hub.send_error(
                    websocket,
                    message="Mensagem realtime invalida.",
                )
                continue

            message_type = str(message.get("type", "")).strip()
            if message_type == "ping":
                await realtime_hub.send_pong(websocket)
                continue
            if message_type == "subscribe":
                expected_channel = f"tenant:{tenant_id}"
                requested_channel = str(message.get("channel", "")).strip()
                if requested_channel != expected_channel:
                    await realtime_hub.send_error(
                        websocket,
                        message="Canal invalido para o tenant autenticado.",
                    )
                continue

            await realtime_hub.send_error(
                websocket,
                message="Tipo de mensagem realtime nao suportado.",
            )
    except WebSocketDisconnect:
        realtime_hub.disconnect(websocket, tenant_id=tenant_id)
    except Exception:
        realtime_hub.disconnect(websocket, tenant_id=tenant_id)
        await websocket.close(code=1011)
