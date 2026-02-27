"""
core/google_auth.py — Verificação real de Google ID Token

Substitui o mock anterior. Verifica o token contra os servidores Google
e retorna os dados do usuário (google_id, email, nome, foto).

Dependência: google-auth (já no requirements.txt)

Uso em produção:
    pip install google-auth requests
    
    No .env:
        GOOGLE_CLIENT_ID=seu_client_id.apps.googleusercontent.com
"""

import logging
from dataclasses import dataclass

import requests
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from backend.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class GoogleUserInfo:
    """Dados extraídos e validados do ID Token do Google."""
    google_id: str
    email: str
    nome_exibicao: str | None
    foto_perfil_url: str | None


class GoogleAuthError(Exception):
    """Lança quando o token Google é inválido, expirado ou manipulado."""
    pass


def verificar_google_token(id_token_str: str) -> GoogleUserInfo:
    """
    Verifica um Google ID Token e retorna os dados do usuário.

    Args:
        id_token_str: O idToken retornado pelo Google Sign-In no frontend.

    Returns:
        GoogleUserInfo com os dados verificados.

    Raises:
        GoogleAuthError: Se o token for inválido, expirado, ou o CLIENT_ID não bater.

    Como obter o GOOGLE_CLIENT_ID:
        1. Acesse console.cloud.google.com
        2. APIs & Serviços → Credenciais → OAuth 2.0 → seu app
        3. Copie o "Client ID" (termina em .apps.googleusercontent.com)
        4. Adicione ao .env: GOOGLE_CLIENT_ID=...
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError(
            "GOOGLE_CLIENT_ID não configurado no .env. "
            "Consulte backend/.env.example para instruções."
        )

    try:
        # google-auth verifica:
        # 1. Assinatura criptográfica com as chaves públicas do Google
        # 2. Campo 'aud' bate com nosso CLIENT_ID (evita token de outro app)
        # 3. Token não expirado ('exp')
        # 4. Token foi emitido pelo Google ('iss')
        request = google_requests.Request()
        payload = id_token.verify_oauth2_token(
            id_token_str,
            request,
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError as e:
        logger.warning("Falha na verificação do token Google: %s", e)
        raise GoogleAuthError(f"Token Google inválido: {e}") from e

    # Extrai campos padronizados do payload JWT do Google
    return GoogleUserInfo(
        google_id=payload["sub"],          # ID único e imutável do usuário no Google
        email=payload["email"],
        nome_exibicao=payload.get("name"), # Nome completo (pode ser None)
        foto_perfil_url=payload.get("picture"),  # URL da foto do perfil
    )
