"""
core/push_sender.py — Adapter de envio de Push Notifications

Design Pattern: Adapter / Strategy
    - Interface única: send_push(token, title, body, data)
    - Implementação atual: simulada (log) para MVP
    - Próxima iteração: trocar _send_expo ou _send_fcm sem mudar os callers

Para produção com Expo Push:
    pip install pyexponent-push-client
    from exponent_server_sdk import PushClient, PushMessage
    PushClient().publish(PushMessage(to=token, title=title, body=body, data=data))

Para produção com Firebase FCM:
    pip install firebase-admin
    firebase_admin.messaging.send(Message(token=token, notification=Notification(...)))
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class PushSendError(Exception):
    """Lança quando o envio de push falha definitivamente."""
    pass


def send_push(
    token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """
    Envia uma push notification para o token fornecido.

    Returns:
        True se enviado com sucesso, False se token inválido.

    Raises:
        PushSendError: em falha de rede ou serviço externo.
    """
    if not token or len(token.strip()) < 5:
        logger.warning("Push ignorado: token inválido ou vazio.")
        return False

    # ── MVP: simulação de envio ───────────────────────────────────────────────
    # Em produção: substituir este bloco pela SDK real (Expo ou FCM)
    logger.info(
        "📲 PUSH ENVIADO | token=%s | title=%r | body=%r | data=%s",
        token[:12] + "…",   # Loga só os primeiros chars por privacidade
        title,
        body,
        data or {},
    )
    # Simula latência de rede (remover em produção)
    # import time; time.sleep(0.1)

    return True


def send_push_to_psicologo(
    psicologo_token: str | None,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """Helper tipado para notificar psicólogo."""
    if not psicologo_token:
        logger.debug("Psicólogo sem push token — notificação omitida.")
        return False
    return send_push(psicologo_token, title, body, data)


def send_push_to_paciente(
    paciente_token: str | None,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """Helper tipado para notificar paciente."""
    if not paciente_token:
        logger.debug("Paciente sem push token — notificação omitida.")
        return False
    return send_push(paciente_token, title, body, data)
