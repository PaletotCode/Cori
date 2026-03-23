import base64
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import AuthContext
from app.core.security import (
    TokenType,
    TokenValidationError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import AuthRefreshToken, PracticeProfile, Psychologist, Tenant, User
from app.schemas.practice_profile import PracticeProfileUpsertRequest
from app.services.practice_profile_service import (
    PracticeProfileServiceError,
    practice_profile_service,
)
from app.services.timeline_service import append_timeline_event
from app.services.triage_service import triage_service


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


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    full_name: str


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

        return self._issue_tokens_for_user(db, user=user, role="psychologist")

    def exchange_google_oauth_code(
        self,
        db: Session,
        *,
        code: str,
        tenant_identifier: str,
        redirect_uri: str,
        role: str,
        state_nonce: str,
        code_verifier: str,
        intake_access_code: str | None,
    ) -> TokenBundle:
        if role not in {"psychologist", "patient"}:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="role invalido para Google OAuth exchange.",
            )

        normalized_nonce = state_nonce.strip()
        if len(normalized_nonce) < 6:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="state_nonce invalido para callback OAuth.",
            )
        normalized_code_verifier = code_verifier.strip()
        if len(normalized_code_verifier) < 43 or len(normalized_code_verifier) > 128:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="code_verifier invalido para callback OAuth.",
            )
        self._validate_google_redirect_uri(redirect_uri)

        if role == "psychologist":
            normalized_tenant_identifier = self._normalize_tenant_identifier(tenant_identifier)
            return self._exchange_google_for_psychologist(
                db,
                code=code,
                redirect_uri=redirect_uri,
                state_nonce=normalized_nonce,
                code_verifier=normalized_code_verifier,
                tenant_identifier=normalized_tenant_identifier,
            )

        return self._exchange_google_for_patient(
            db,
            code=code,
            redirect_uri=redirect_uri,
            state_nonce=normalized_nonce,
            code_verifier=normalized_code_verifier,
            intake_access_code=intake_access_code,
        )

    def _exchange_google_for_psychologist(
        self,
        db: Session,
        *,
        code: str,
        redirect_uri: str,
        state_nonce: str,
        code_verifier: str,
        tenant_identifier: str,
    ) -> TokenBundle:
        identity = self._resolve_google_identity(
            code=code,
            redirect_uri=redirect_uri,
            state_nonce=state_nonce,
            code_verifier=code_verifier,
        )

        db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))
        existing_user = db.scalar(select(User).where(func.lower(User.email) == identity.email))

        if existing_user is not None and not existing_user.is_active:
            raise AuthServiceError(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario inativo. Contate o administrador do tenant.",
            )

        if existing_user is not None:
            tenant = db.scalar(select(Tenant).where(Tenant.id == existing_user.tenant_id))
            if tenant is None:
                raise AuthServiceError(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Tenant associado ao usuario nao encontrado.",
                )
            if not self._tenant_matches_identifier(tenant, tenant_identifier):
                raise AuthServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Este email ja esta associado a outro tenant. "
                        "Use o tenant correto para continuar."
                    ),
                )
            user = existing_user
        else:
            tenant, identifier_is_uuid = self._resolve_tenant_by_identifier(
                db,
                tenant_identifier,
            )
            if tenant is None and identifier_is_uuid:
                raise AuthServiceError(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tenant informado nao foi encontrado.",
                )

            if tenant is None:
                tenant = Tenant(name=tenant_identifier)
                db.add(tenant)
                db.flush()

            user = User(
                tenant_id=tenant.id,
                email=identity.email,
                full_name=identity.full_name,
                password_hash=hash_password(os.urandom(24).hex()),
                is_active=True,
            )
            db.add(user)
            db.flush()

        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(user.tenant_id)},
        )

        if user.full_name != identity.full_name:
            user.full_name = identity.full_name

        psychologist = db.scalar(
            select(Psychologist).where(
                Psychologist.user_id == user.id,
                Psychologist.tenant_id == user.tenant_id,
            )
        )
        if psychologist is None:
            psychologist = Psychologist(
                tenant_id=user.tenant_id,
                user_id=user.id,
                display_name=identity.full_name,
            )
            db.add(psychologist)
            db.flush()
        elif psychologist.display_name != identity.full_name:
            psychologist.display_name = identity.full_name

        return self._issue_tokens_for_user(db, user=user, role="psychologist")

    def _exchange_google_for_patient(
        self,
        db: Session,
        *,
        code: str,
        redirect_uri: str,
        state_nonce: str,
        code_verifier: str,
        intake_access_code: str | None,
    ) -> TokenBundle:
        normalized_access_code = (intake_access_code or "").strip().upper()
        if len(normalized_access_code) == 0:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe o codigo de acesso para entrar no tenant do paciente.",
            )

        validation = triage_service.validate_access_code(db, code=normalized_access_code)
        if not validation.valid or validation.intake is None:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=validation.message,
            )

        intake = validation.intake
        identity = self._resolve_google_identity(
            code=code,
            redirect_uri=redirect_uri,
            state_nonce=state_nonce,
            code_verifier=code_verifier,
        )

        if (
            intake.patient_oauth_google_subject is not None
            and intake.patient_oauth_google_subject != identity.subject
        ):
            raise AuthServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este codigo ja foi vinculado a outra conta Google.",
            )
        if intake.patient_oauth_email is not None and intake.patient_oauth_email != identity.email:
            raise AuthServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este codigo ja foi vinculado a outro email Google.",
            )
        if intake.patient_email is not None and intake.patient_email.lower() != identity.email:
            raise AuthServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="O email Google nao corresponde ao cadastro da triagem em andamento.",
            )

        db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))
        user = db.scalar(select(User).where(func.lower(User.email) == identity.email))

        if user is not None and not user.is_active:
            raise AuthServiceError(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario inativo. Contate o administrador do tenant.",
            )

        if user is not None and user.tenant_id != intake.tenant_id:
            raise AuthServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Este email ja esta associado a outro tenant. "
                    "Use a conta correta para continuar."
                ),
            )

        if user is not None:
            psychologist = db.scalar(
                select(Psychologist).where(
                    Psychologist.user_id == user.id,
                    Psychologist.tenant_id == user.tenant_id,
                )
            )
            if psychologist is not None:
                raise AuthServiceError(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Esta conta Google ja esta vinculada ao acesso de psicologo.",
                )
        else:
            user = User(
                tenant_id=intake.tenant_id,
                email=identity.email,
                full_name=identity.full_name,
                password_hash=hash_password(os.urandom(24).hex()),
                is_active=True,
            )
            db.add(user)
            db.flush()

        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(user.tenant_id)},
        )

        if user.full_name != identity.full_name:
            user.full_name = identity.full_name

        if intake.patient_auth_user_id is not None and intake.patient_auth_user_id != user.id:
            raise AuthServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este codigo ja foi vinculado a outra conta de paciente.",
            )

        intake.patient_auth_user_id = user.id
        now = datetime.now(UTC)
        intake.patient_oauth_google_subject = identity.subject
        intake.patient_oauth_email = identity.email
        intake.patient_oauth_full_name = identity.full_name
        intake.patient_oauth_authenticated_at = now
        if intake.patient_email is None:
            intake.patient_email = identity.email
        if intake.patient_full_name is None:
            intake.patient_full_name = identity.full_name

        append_timeline_event(
            db,
            tenant_id=intake.tenant_id,
            intake_id=intake.id,
            actor_type="patient",
            event_type="intake_oauth_authenticated",
            payload={
                "google_email": identity.email,
                "authenticated_at": now.isoformat(),
            },
        )

        return self._issue_tokens_for_user(db, user=user, role="patient")

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
            role=token_data.role,
        )
        new_refresh_token, refresh_expires_at, new_refresh_jti = create_refresh_token(
            user_id=token_data.user_id,
            tenant_id=token_data.tenant_id,
            role=token_data.role,
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

    def complete_onboarding(
        self,
        db: Session,
        *,
        context: AuthContext,
        display_name: str,
        clinical_approach: str,
        service_modality: str,
    ) -> ProfileBundle:
        normalized_display_name = display_name.strip()
        normalized_clinical_approach = clinical_approach.strip()
        if len(normalized_display_name) < 2:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe um nome de exibicao valido para concluir o onboarding.",
            )
        if len(normalized_clinical_approach) < 2:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe uma abordagem clinica valida para concluir o onboarding.",
            )
        if service_modality not in {"online", "presential", "hybrid"}:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Modalidade de atendimento invalida para concluir o onboarding.",
            )

        user = db.scalar(
            select(User).where(
                User.id == context.user_id,
                User.tenant_id == context.tenant_id,
                User.is_active.is_(True),
            )
        )
        if user is None:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sessao invalida para concluir onboarding.",
            )

        psychologist = db.scalar(
            select(Psychologist).where(
                Psychologist.user_id == context.user_id,
                Psychologist.tenant_id == context.tenant_id,
            )
        )
        if psychologist is None:
            raise AuthServiceError(
                status_code=status.HTTP_409_CONFLICT,
                detail="Perfil de psicologo nao encontrado para concluir onboarding.",
            )

        if psychologist.display_name != normalized_display_name:
            psychologist.display_name = normalized_display_name
        if user.full_name != normalized_display_name:
            user.full_name = normalized_display_name

        existing_profile = db.scalar(
            select(PracticeProfile).where(PracticeProfile.tenant_id == context.tenant_id)
        )
        practice_name = (
            existing_profile.practice_name
            if existing_profile is not None
            else (
                f"Clinica {normalized_display_name}"
                if len(normalized_display_name) >= 3
                else "Clinica Cori"
            )
        )
        in_person_address = (
            existing_profile.in_person_address
            if existing_profile is not None
            else "Endereco a definir"
            if service_modality in {"presential", "hybrid"}
            else None
        )
        if service_modality == "online":
            in_person_address = None

        upsert_payload = PracticeProfileUpsertRequest(
            practice_name=practice_name,
            clinical_approach=normalized_clinical_approach,
            service_modality=service_modality,
            in_person_address=in_person_address,
            session_price_cents=(
                existing_profile.session_price_cents if existing_profile is not None else 25000
            ),
            currency=(existing_profile.currency if existing_profile is not None else "BRL"),
            late_cancellation_window_hours=(
                existing_profile.late_cancellation_window_hours
                if existing_profile is not None
                else 24
            ),
            late_cancellation_fee_percent=(
                existing_profile.late_cancellation_fee_percent
                if existing_profile is not None
                else 40
            ),
            no_show_fee_percent=(
                existing_profile.no_show_fee_percent if existing_profile is not None else 80
            ),
            notification_email_enabled=(
                existing_profile.notification_email_enabled
                if existing_profile is not None
                else False
            ),
            notification_whatsapp_enabled=(
                existing_profile.notification_whatsapp_enabled
                if existing_profile is not None
                else False
            ),
            notification_push_enabled=(
                existing_profile.notification_push_enabled if existing_profile is not None else True
            ),
            session_reminder_hours_before=(
                existing_profile.session_reminder_hours_before
                if existing_profile is not None
                else [24, 2]
            ),
            default_triage_mode=(
                existing_profile.default_triage_mode if existing_profile is not None else "standard"
            ),
            default_triage_message=(
                existing_profile.default_triage_message if existing_profile is not None else None
            ),
        )
        try:
            practice_profile_service.upsert_for_tenant(
                db,
                tenant_id=context.tenant_id,
                payload=upsert_payload,
            )
        except PracticeProfileServiceError as exc:
            raise AuthServiceError(
                status_code=exc.status_code,
                detail=exc.detail,
            ) from exc

        return self.profile(db, context=context)

    def _issue_tokens_for_user(
        self,
        db: Session,
        *,
        user: User,
        role: str,
    ) -> TokenBundle:
        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(user.tenant_id)},
        )

        access_token, access_expires_at = create_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            role=role,
        )
        refresh_token, refresh_expires_at, refresh_jti = create_refresh_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            role=role,
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

    def _resolve_google_identity(
        self,
        *,
        code: str,
        redirect_uri: str,
        state_nonce: str,
        code_verifier: str,
    ) -> GoogleIdentity:
        exchange_payload = self._exchange_google_code_for_tokens(
            code=code,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier,
        )

        access_token = exchange_payload.get("access_token")
        if not isinstance(access_token, str) or len(access_token.strip()) == 0:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google nao retornou access_token valido no exchange OAuth.",
            )

        claims: dict[str, object] | None = None
        id_token = exchange_payload.get("id_token")
        if isinstance(id_token, str) and len(id_token.strip()) > 0:
            claims = self._decode_jwt_payload_without_verification(id_token)
            self._validate_google_id_token_claims(claims=claims, expected_nonce=state_nonce)
            identity_from_id_token = self._extract_google_identity(claims)
            if identity_from_id_token is not None:
                return identity_from_id_token

        userinfo_payload = self._fetch_google_userinfo(access_token=access_token)
        identity_from_userinfo = self._extract_google_identity(userinfo_payload)
        if identity_from_userinfo is not None:
            return identity_from_userinfo

        if claims is not None and claims.get("email_verified") in {False, "false", "0"}:
            raise AuthServiceError(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Conta Google sem email verificado nao pode autenticar.",
            )

        raise AuthServiceError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google nao retornou identidade valida com email verificado.",
        )

    def _exchange_google_code_for_tokens(
        self,
        *,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict[str, object]:
        client_id, client_secret = self._resolve_google_exchange_credentials(
            redirect_uri=redirect_uri
        )

        form_payload: dict[str, str] = {
            "code": code,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier,
        }
        if client_secret is not None and len(client_secret) > 0:
            form_payload["client_secret"] = client_secret

        request = Request(
            settings.google_oauth_token_url,
            data=urlencode(form_payload).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        payload = self._perform_json_request(
            request,
            default_status=status.HTTP_401_UNAUTHORIZED,
            failure_prefix="Falha no exchange OAuth com Google.",
        )
        if not isinstance(payload, dict):
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google retornou payload invalido no exchange OAuth.",
            )
        return payload

    def _resolve_google_exchange_credentials(self, *, redirect_uri: str) -> tuple[str, str | None]:
        ios_client_id = settings.google_oauth_ios_client_id.strip()
        web_client_id = settings.google_oauth_client_id.strip()
        web_client_secret = settings.google_oauth_client_secret.strip() or None

        uses_expo_proxy = redirect_uri.startswith("https://auth.expo.io/")
        if uses_expo_proxy:
            if len(web_client_id) == 0:
                raise AuthServiceError(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "GOOGLE_OAUTH_CLIENT_ID nao configurado para redirect_uri auth.expo.io."
                    ),
                )
            return web_client_id, web_client_secret

        if len(ios_client_id) > 0:
            return ios_client_id, None
        if len(web_client_id) > 0:
            return web_client_id, web_client_secret

        raise AuthServiceError(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GOOGLE_OAUTH_IOS_CLIENT_ID ou GOOGLE_OAUTH_CLIENT_ID nao configurado.",
        )

    def _fetch_google_userinfo(self, *, access_token: str) -> dict[str, object]:
        request = Request(
            settings.google_oauth_userinfo_url,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {access_token}",
            },
            method="GET",
        )
        payload = self._perform_json_request(
            request,
            default_status=status.HTTP_401_UNAUTHORIZED,
            failure_prefix="Falha ao consultar userinfo no Google OAuth.",
        )
        if not isinstance(payload, dict):
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google retornou userinfo invalido.",
            )
        return payload

    def _perform_json_request(
        self,
        request: Request,
        *,
        default_status: int,
        failure_prefix: str,
    ) -> object:
        timeout = max(1, settings.google_oauth_http_timeout_seconds)
        try:
            with urlopen(request, timeout=timeout) as response:
                raw_body = response.read().decode("utf-8")
        except HTTPError as exc:
            provider_body = exc.read().decode("utf-8", errors="ignore").strip()
            detail_suffix = provider_body if len(provider_body) > 0 else str(exc.reason)
            raise AuthServiceError(
                status_code=default_status,
                detail=f"{failure_prefix} {detail_suffix}",
            ) from exc
        except URLError as exc:
            raise AuthServiceError(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"{failure_prefix} Provedor Google indisponivel no momento.",
            ) from exc

        try:
            return json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise AuthServiceError(
                status_code=default_status,
                detail=f"{failure_prefix} Provedor retornou JSON invalido.",
            ) from exc

    def _validate_google_id_token_claims(
        self,
        *,
        claims: dict[str, object],
        expected_nonce: str,
    ) -> None:
        issuer = claims.get("iss")
        if issuer not in {"https://accounts.google.com", "accounts.google.com"}:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="id_token Google invalido: issuer nao reconhecido.",
            )

        allowed_audiences = {
            value.strip()
            for value in (
                settings.google_oauth_client_id,
                settings.google_oauth_ios_client_id,
            )
            if len(value.strip()) > 0
        }
        if len(allowed_audiences) == 0:
            raise AuthServiceError(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Nenhum audience Google OAuth valido foi configurado no backend.",
            )

        aud = claims.get("aud")
        audience_values: set[str] = set()
        if isinstance(aud, str):
            audience_values = {aud}
        elif isinstance(aud, list):
            audience_values = {item for item in aud if isinstance(item, str)}

        if len(audience_values & allowed_audiences) == 0:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="id_token Google invalido: audience inesperado.",
            )

        exp = claims.get("exp")
        if not isinstance(exp, int) or exp <= int(datetime.now(UTC).timestamp()):
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="id_token Google expirado ou sem claim exp valida.",
            )

        nonce_claim = claims.get("nonce")
        if isinstance(nonce_claim, str) and len(nonce_claim) > 0 and nonce_claim != expected_nonce:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="id_token Google invalido: nonce divergente.",
            )

    def _extract_google_identity(self, payload: dict[str, object]) -> GoogleIdentity | None:
        subject = payload.get("sub")
        email = payload.get("email")
        full_name = payload.get("name")
        email_verified = self._to_bool(payload.get("email_verified"))

        if not isinstance(subject, str) or len(subject.strip()) == 0:
            return None

        if not isinstance(email, str) or len(email.strip()) == 0:
            return None

        if email_verified is False:
            raise AuthServiceError(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Conta Google sem email verificado nao pode autenticar.",
            )
        if email_verified is None:
            return None

        normalized_email = email.strip().lower()
        normalized_name = (
            full_name.strip()
            if isinstance(full_name, str) and len(full_name.strip()) > 0
            else normalized_email.split("@", maxsplit=1)[0]
        )

        return GoogleIdentity(
            subject=subject.strip(),
            email=normalized_email,
            full_name=normalized_name,
        )

    def _decode_jwt_payload_without_verification(self, token: str) -> dict[str, object]:
        chunks = token.split(".")
        if len(chunks) != 3:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="id_token Google invalido: formato JWT incompativel.",
            )

        payload_segment = chunks[1]
        padded = payload_segment + "=" * ((4 - (len(payload_segment) % 4)) % 4)
        try:
            decoded_payload = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
            parsed = json.loads(decoded_payload)
        except (ValueError, json.JSONDecodeError) as exc:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="id_token Google invalido: payload nao decodificavel.",
            ) from exc

        if not isinstance(parsed, dict):
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="id_token Google invalido: payload nao estruturado.",
            )

        return parsed

    def _resolve_tenant_by_identifier(
        self,
        db: Session,
        tenant_identifier: str,
    ) -> tuple[Tenant | None, bool]:
        parsed_uuid = self._try_parse_uuid(tenant_identifier)
        if parsed_uuid is not None:
            tenant = db.scalar(select(Tenant).where(Tenant.id == parsed_uuid))
            return tenant, True

        tenant = db.scalar(select(Tenant).where(Tenant.name == tenant_identifier))
        if tenant is None:
            tenant = db.scalar(
                select(Tenant)
                .where(func.lower(Tenant.name) == tenant_identifier.casefold())
                .limit(1)
            )
        return tenant, False

    def _tenant_matches_identifier(self, tenant: Tenant, tenant_identifier: str) -> bool:
        parsed_uuid = self._try_parse_uuid(tenant_identifier)
        if parsed_uuid is not None:
            return tenant.id == parsed_uuid
        return tenant.name.casefold() == tenant_identifier.casefold()

    def _normalize_tenant_identifier(self, tenant_identifier: str) -> str:
        normalized = " ".join(tenant_identifier.strip().split())
        if len(normalized) == 0:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="tenant_id invalido para OAuth exchange.",
            )
        if len(normalized) > 160:
            raise AuthServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="tenant_id excede o limite maximo de 160 caracteres.",
            )
        return normalized

    def _to_bool(self, value: object) -> bool | None:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes"}:
                return True
            if normalized in {"0", "false", "no"}:
                return False
        return None

    def _try_parse_uuid(self, value: str) -> UUID | None:
        try:
            return UUID(value)
        except ValueError:
            return None

    def _validate_google_redirect_uri(self, redirect_uri: str) -> None:
        allowed_raw = settings.google_oauth_allowed_redirect_uris.strip()
        if len(allowed_raw) == 0:
            return

        allowed_uris = {
            item.strip()
            for item in allowed_raw.split(",")
            if len(item.strip()) > 0
        }
        if redirect_uri not in allowed_uris:
            raise AuthServiceError(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="redirect_uri nao permitido para Google OAuth exchange.",
            )


auth_service = AuthService()
