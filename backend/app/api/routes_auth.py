from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext, get_auth_context, get_db, get_tenant_db
from app.schemas.auth import (
    CompleteOnboardingRequest,
    GoogleOAuthExchangeRequest,
    LoginRequest,
    LogoutRequest,
    LogoutResponse,
    ProfileResponse,
    RefreshRequest,
    TokenPairResponse,
)
from app.services.auth_service import AuthServiceError, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPairResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
    try:
        bundle = auth_service.login(db, email=payload.email, password=payload.password)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return TokenPairResponse(
        access_token=bundle.access_token,
        refresh_token=bundle.refresh_token,
        access_expires_in=bundle.access_expires_in,
        refresh_expires_in=bundle.refresh_expires_in,
    )


@router.post("/google/exchange", response_model=TokenPairResponse)
def exchange_google_oauth_code(
    payload: GoogleOAuthExchangeRequest,
    db: Session = Depends(get_db),
) -> TokenPairResponse:
    try:
        bundle = auth_service.exchange_google_oauth_code(
            db,
            code=payload.code,
            tenant_identifier=payload.tenant_id,
            redirect_uri=payload.redirect_uri,
            role=payload.role,
            state_nonce=payload.state_nonce,
            code_verifier=payload.code_verifier,
            intake_access_code=payload.intake_access_code,
        )
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return TokenPairResponse(
        access_token=bundle.access_token,
        refresh_token=bundle.refresh_token,
        access_expires_in=bundle.access_expires_in,
        refresh_expires_in=bundle.refresh_expires_in,
    )


@router.post("/refresh", response_model=TokenPairResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
    try:
        bundle = auth_service.refresh(db, refresh_token=payload.refresh_token)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return TokenPairResponse(
        access_token=bundle.access_token,
        refresh_token=bundle.refresh_token,
        access_expires_in=bundle.access_expires_in,
        refresh_expires_in=bundle.refresh_expires_in,
    )


@router.post("/logout", response_model=LogoutResponse)
def logout(payload: LogoutRequest, db: Session = Depends(get_db)) -> LogoutResponse:
    try:
        auth_service.logout(db, refresh_token=payload.refresh_token)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return LogoutResponse(success=True)


@router.get("/me", response_model=ProfileResponse)
def me(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ProfileResponse:
    try:
        profile = auth_service.profile(db, context=context)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return ProfileResponse(
        user_id=str(profile.user_id),
        tenant_id=str(profile.tenant_id),
        psychologist_id=str(profile.psychologist_id) if profile.psychologist_id else None,
        email=profile.email,
        full_name=profile.full_name,
        onboarding_completed=profile.onboarding_completed,
    )


@router.post("/onboarding/complete", response_model=ProfileResponse)
def complete_onboarding(
    payload: CompleteOnboardingRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ProfileResponse:
    try:
        profile = auth_service.complete_onboarding(
            db,
            context=context,
            display_name=payload.display_name,
            clinical_approach=payload.clinical_approach,
            service_modality=payload.service_modality,
        )
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return ProfileResponse(
        user_id=str(profile.user_id),
        tenant_id=str(profile.tenant_id),
        psychologist_id=str(profile.psychologist_id) if profile.psychologist_id else None,
        email=profile.email,
        full_name=profile.full_name,
        onboarding_completed=profile.onboarding_completed,
    )
