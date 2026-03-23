import base64
import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Literal
from uuid import UUID, uuid4

import jwt
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
AuthTokenRole = Literal["psychologist", "patient"]


class TokenType(str, Enum):
    ACCESS = "access"
    REFRESH = "refresh"


@dataclass(frozen=True)
class TokenData:
    user_id: UUID
    tenant_id: UUID
    role: AuthTokenRole
    token_type: TokenType
    expires_at: datetime
    jti: UUID | None


class TokenValidationError(ValueError):
    pass


def hash_password(password: str) -> str:
    iterations = 390000
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)

    salt_b64 = base64.b64encode(salt).decode("utf-8")
    digest_b64 = base64.b64encode(digest).decode("utf-8")
    return f"pbkdf2_sha256${iterations}${salt_b64}${digest_b64}"


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_b64, digest_b64 = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False

        iterations = int(iterations_raw)
        salt = base64.b64decode(salt_b64.encode("utf-8"))
        expected_digest = base64.b64decode(digest_b64.encode("utf-8"))
    except (ValueError, TypeError):
        return False

    computed_digest = hashlib.pbkdf2_hmac(
        "sha256",
        plain_password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(computed_digest, expected_digest)


def _build_payload(
    *,
    user_id: UUID,
    tenant_id: UUID,
    role: AuthTokenRole,
    token_type: TokenType,
    expires_delta: timedelta,
    jti: UUID | None = None,
) -> tuple[dict[str, str | int], datetime]:
    issued_at = datetime.now(UTC)
    expires_at = issued_at + expires_delta
    payload: dict[str, str | int] = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "role": role,
        "type": token_type.value,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    if jti is not None:
        payload["jti"] = str(jti)
    return payload, expires_at


def create_access_token(
    *,
    user_id: UUID,
    tenant_id: UUID,
    role: AuthTokenRole,
) -> tuple[str, datetime]:
    payload, expires_at = _build_payload(
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        token_type=TokenType.ACCESS,
        expires_delta=timedelta(minutes=settings.access_token_exp_minutes),
    )
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_at


def create_refresh_token(
    *,
    user_id: UUID,
    tenant_id: UUID,
    role: AuthTokenRole,
) -> tuple[str, datetime, UUID]:
    refresh_jti = uuid4()
    payload, expires_at = _build_payload(
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        token_type=TokenType.REFRESH,
        expires_delta=timedelta(days=settings.refresh_token_exp_days),
        jti=refresh_jti,
    )
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_at, refresh_jti


def decode_token(token: str, *, expected_type: TokenType | None = None) -> TokenData:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.InvalidTokenError as exc:
        raise TokenValidationError("Token invalido.") from exc

    token_type_raw = payload.get("type")
    sub = payload.get("sub")
    tenant_id_raw = payload.get("tenant_id")
    role_raw = payload.get("role")
    exp = payload.get("exp")
    jti_raw = payload.get("jti")

    if not isinstance(token_type_raw, str) or token_type_raw not in {"access", "refresh"}:
        raise TokenValidationError("Tipo de token invalido.")

    token_type = TokenType(token_type_raw)
    if expected_type is not None and token_type != expected_type:
        raise TokenValidationError("Tipo de token nao permitido para esta operacao.")

    if not isinstance(role_raw, str):
        role_raw = "psychologist"
    if role_raw not in {"psychologist", "patient"}:
        raise TokenValidationError("Role de token invalido.")
    role: AuthTokenRole = "psychologist" if role_raw == "psychologist" else "patient"

    if not isinstance(sub, str) or not isinstance(tenant_id_raw, str) or not isinstance(exp, int):
        raise TokenValidationError("Payload do token incompleto.")

    try:
        user_id = UUID(sub)
        tenant_id = UUID(tenant_id_raw)
        jti = UUID(jti_raw) if isinstance(jti_raw, str) else None
    except ValueError as exc:
        raise TokenValidationError("Payload do token invalido.") from exc

    expires_at = datetime.fromtimestamp(exp, UTC)

    return TokenData(
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        token_type=token_type,
        expires_at=expires_at,
        jti=jti,
    )
