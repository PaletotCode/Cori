from uuid import uuid4

from app.core.dependencies import build_auth_context
from app.core.security import create_access_token


def test_build_auth_context_extracts_tenant_id() -> None:
    user_id = uuid4()
    tenant_id = uuid4()
    token, _ = create_access_token(user_id=user_id, tenant_id=tenant_id)

    context = build_auth_context(token)

    assert context.user_id == user_id
    assert context.tenant_id == tenant_id
