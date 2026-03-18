from uuid import uuid4

import pytest

from app.core.security import (
    TokenType,
    TokenValidationError,
    create_access_token,
    create_refresh_token,
    decode_token,
)


def test_access_token_preserves_tenant_id() -> None:
    user_id = uuid4()
    tenant_id = uuid4()

    token, _ = create_access_token(user_id=user_id, tenant_id=tenant_id)
    decoded = decode_token(token, expected_type=TokenType.ACCESS)

    assert decoded.user_id == user_id
    assert decoded.tenant_id == tenant_id
    assert decoded.token_type == TokenType.ACCESS


def test_refresh_token_rejects_wrong_expected_type() -> None:
    token, _, _ = create_refresh_token(user_id=uuid4(), tenant_id=uuid4())

    with pytest.raises(TokenValidationError):
        decode_token(token, expected_type=TokenType.ACCESS)
