from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.security import TokenType, TokenValidationError, decode_token


class TenantContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request.state.tenant_id = None

        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                token_data = decode_token(token, expected_type=TokenType.ACCESS)
                request.state.tenant_id = str(token_data.tenant_id)
            except TokenValidationError:
                request.state.tenant_id = None

        return await call_next(request)
