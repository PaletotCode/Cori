from collections.abc import Generator
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import TokenType, TokenValidationError, decode_token, oauth2_scheme


@dataclass(frozen=True)
class AuthContext:
    user_id: UUID
    tenant_id: UUID


def build_auth_context(token: str) -> AuthContext:
    token_data = decode_token(token, expected_type=TokenType.ACCESS)
    return AuthContext(user_id=token_data.user_id, tenant_id=token_data.tenant_id)


def get_auth_context(token: str = Depends(oauth2_scheme)) -> AuthContext:
    try:
        return build_auth_context(token)
    except TokenValidationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


def get_tenant_id_from_request(request: Request) -> UUID | None:
    tenant_id_raw = getattr(request.state, "tenant_id", None)
    if tenant_id_raw is None:
        return None

    try:
        return UUID(str(tenant_id_raw))
    except ValueError:
        return None


def _apply_app_role(db: Session) -> None:
    db.execute(text("SET LOCAL ROLE cori_app"))


def get_tenant_db(
    context: AuthContext = Depends(get_auth_context),
) -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        _apply_app_role(db)
        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(context.tenant_id)},
        )
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        _apply_app_role(db)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
