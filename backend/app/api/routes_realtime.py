import json
from dataclasses import dataclass
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.security import TokenType, TokenValidationError, decode_token
from app.services.notification_service import NotificationServiceError, notification_service
from app.services.realtime_hub import realtime_hub

router = APIRouter(tags=["realtime"])


@dataclass(frozen=True)
class RealtimeConnectionContext:
    tenant_id: UUID
    allowed_channels: set[str]
    default_channels: set[str]


def _extract_access_context(access_token: str) -> RealtimeConnectionContext:
    token_data = decode_token(access_token.strip(), expected_type=TokenType.ACCESS)
    if token_data.role != "psychologist":
        raise TokenValidationError("Perfil sem permissao para realtime administrativo.")
    tenant_channel = f"tenant:{token_data.tenant_id}"
    return RealtimeConnectionContext(
        tenant_id=token_data.tenant_id,
        allowed_channels={tenant_channel},
        default_channels={tenant_channel},
    )


def _extract_patient_context(patient_access_token: str) -> RealtimeConnectionContext:
    with SessionLocal() as db:
        db.execute(text("SET LOCAL ROLE cori_app"))
        try:
            patient, tenant_id = notification_service.resolve_public_token(
                db,
                patient_access_token=patient_access_token.strip(),
            )
        except NotificationServiceError as exc:
            raise TokenValidationError(exc.detail) from exc

    patient_channel = f"patient:{patient.id}"
    return RealtimeConnectionContext(
        tenant_id=tenant_id,
        allowed_channels={patient_channel},
        default_channels={patient_channel},
    )


def _extract_realtime_context(websocket: WebSocket) -> RealtimeConnectionContext:
    access_token = websocket.query_params.get("token")
    if access_token is not None and access_token.strip() != "":
        return _extract_access_context(access_token)

    patient_token = websocket.query_params.get("patient_token")
    if patient_token is not None and patient_token.strip() != "":
        return _extract_patient_context(patient_token)

    raise TokenValidationError("Token de acesso ausente para realtime.")


@router.websocket("/ws")
async def websocket_realtime(websocket: WebSocket) -> None:
    try:
        context = _extract_realtime_context(websocket)
    except TokenValidationError:
        await websocket.close(code=4401)
        return

    await realtime_hub.connect(
        websocket,
        tenant_id=context.tenant_id,
        default_channels=context.default_channels,
        allowed_channels=context.allowed_channels,
    )

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
                requested_channel = str(message.get("channel", "")).strip()
                if len(requested_channel) == 0:
                    await realtime_hub.send_error(
                        websocket,
                        message="Canal de assinatura nao informado.",
                    )
                    continue

                subscribed = await realtime_hub.subscribe(
                    websocket,
                    channel=requested_channel,
                )
                if not subscribed:
                    await realtime_hub.send_error(
                        websocket,
                        message="Canal invalido para o contexto autenticado.",
                    )
                continue

            await realtime_hub.send_error(
                websocket,
                message="Tipo de mensagem realtime nao suportado.",
            )
    except WebSocketDisconnect:
        realtime_hub.disconnect(websocket, tenant_id=context.tenant_id)
    except Exception:
        realtime_hub.disconnect(websocket, tenant_id=context.tenant_id)
        await websocket.close(code=1011)
