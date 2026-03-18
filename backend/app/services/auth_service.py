from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext
from app.core.security import (
    TokenType,
    TokenValidationError,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models import AuthRefreshToken, PracticeProfile, Psychologist, User


class AuthServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class TokenBundle:
    access_token: str
    refresh_token: str
    access_expires_in: int
    refresh_expires_in: int


@dataclass(frozen=True)
class ProfileBundle:
    user_id: UUID
    tenant_id: UUID
    psychologist_id: UUID | None
    email: str
    full_name: str
    onboarding_completed: bool


class AuthService:
    def login(self, db: Session, *, email: str, password: str) -> TokenBundle:
        normalized_email = email.strip().lower()

        db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))
        user = db.scalar(
            select(User).where(User.email == normalized_email, User.is_active.is_(True))
        )

        if user is None or not verify_password(password, user.password_hash):
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais invalidas."
            )

        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(user.tenant_id)},
        )

        access_token, access_expires_at = create_access_token(
            user_id=user.id, tenant_id=user.tenant_id
        )
        refresh_token, refresh_expires_at, refresh_jti = create_refresh_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
        )

        db.add(
            AuthRefreshToken(
                id=refresh_jti,
                tenant_id=user.tenant_id,
                user_id=user.id,
                expires_at=refresh_expires_at,
            )
        )

        now = datetime.now(UTC)
        return TokenBundle(
            access_token=access_token,
            refresh_token=refresh_token,
            access_expires_in=max(0, int((access_expires_at - now).total_seconds())),
            refresh_expires_in=max(0, int((refresh_expires_at - now).total_seconds())),
        )

    def refresh(self, db: Session, *, refresh_token: str) -> TokenBundle:
        try:
            token_data = decode_token(refresh_token, expected_type=TokenType.REFRESH)
        except TokenValidationError as exc:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
            ) from exc

        if token_data.jti is None:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token sem identificador.",
            )

        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(token_data.tenant_id)},
        )

        token_row = db.scalar(
            select(AuthRefreshToken).where(
                AuthRefreshToken.id == token_data.jti,
                AuthRefreshToken.user_id == token_data.user_id,
                AuthRefreshToken.tenant_id == token_data.tenant_id,
                AuthRefreshToken.revoked_at.is_(None),
            )
        )

        now = datetime.now(UTC)
        if token_row is None or token_row.expires_at <= now:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalido."
            )

        token_row.revoked_at = now

        access_token, access_expires_at = create_access_token(
            user_id=token_data.user_id,
            tenant_id=token_data.tenant_id,
        )
        new_refresh_token, refresh_expires_at, new_refresh_jti = create_refresh_token(
            user_id=token_data.user_id,
            tenant_id=token_data.tenant_id,
        )

        db.add(
            AuthRefreshToken(
                id=new_refresh_jti,
                tenant_id=token_data.tenant_id,
                user_id=token_data.user_id,
                expires_at=refresh_expires_at,
            )
        )

        return TokenBundle(
            access_token=access_token,
            refresh_token=new_refresh_token,
            access_expires_in=max(0, int((access_expires_at - now).total_seconds())),
            refresh_expires_in=max(0, int((refresh_expires_at - now).total_seconds())),
        )

    def logout(self, db: Session, *, refresh_token: str) -> None:
        try:
            token_data = decode_token(refresh_token, expected_type=TokenType.REFRESH)
        except TokenValidationError as exc:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
            ) from exc

        if token_data.jti is None:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token sem identificador.",
            )

        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(token_data.tenant_id)},
        )

        token_row = db.scalar(
            select(AuthRefreshToken).where(
                AuthRefreshToken.id == token_data.jti,
                AuthRefreshToken.user_id == token_data.user_id,
                AuthRefreshToken.tenant_id == token_data.tenant_id,
                AuthRefreshToken.revoked_at.is_(None),
            )
        )
        if token_row is None:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalido."
            )

        token_row.revoked_at = datetime.now(UTC)

    def profile(self, db: Session, *, context: AuthContext) -> ProfileBundle:
        user = db.scalar(
            select(User).where(
                User.id == context.user_id,
                User.tenant_id == context.tenant_id,
                User.is_active.is_(True),
            )
        )
        if user is None:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario nao encontrado."
            )

        psychologist = db.scalar(
            select(Psychologist).where(
                Psychologist.user_id == context.user_id,
                Psychologist.tenant_id == context.tenant_id,
            )
        )
        practice_profile = db.scalar(
            select(PracticeProfile).where(PracticeProfile.tenant_id == context.tenant_id)
        )

        return ProfileBundle(
            user_id=user.id,
            tenant_id=user.tenant_id,
            psychologist_id=psychologist.id if psychologist is not None else None,
            email=user.email,
            full_name=user.full_name,
            onboarding_completed=(
                practice_profile.onboarding_completed if practice_profile is not None else False
            ),
        )


auth_service = AuthService()
