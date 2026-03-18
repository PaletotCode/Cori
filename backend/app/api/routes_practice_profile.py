from typing import cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext, get_auth_context, get_tenant_db
from app.models import PracticeProfile
from app.schemas.practice_profile import (
    PracticeProfileResponse,
    PracticeProfileUpsertRequest,
    ServiceModality,
    TriageMode,
)
from app.services.practice_profile_service import (
    PracticeProfileServiceError,
    practice_profile_service,
)

router = APIRouter(prefix="/practice-profile", tags=["practice_profile"])


def _to_response(profile: PracticeProfile) -> PracticeProfileResponse:
    return PracticeProfileResponse(
        id=str(profile.id),
        tenant_id=str(profile.tenant_id),
        practice_name=profile.practice_name,
        clinical_approach=profile.clinical_approach,
        service_modality=cast(ServiceModality, profile.service_modality),
        in_person_address=profile.in_person_address,
        session_price_cents=profile.session_price_cents,
        currency=profile.currency,
        late_cancellation_window_hours=profile.late_cancellation_window_hours,
        late_cancellation_fee_percent=profile.late_cancellation_fee_percent,
        no_show_fee_percent=profile.no_show_fee_percent,
        notification_email_enabled=profile.notification_email_enabled,
        notification_whatsapp_enabled=profile.notification_whatsapp_enabled,
        notification_push_enabled=profile.notification_push_enabled,
        session_reminder_hours_before=profile.session_reminder_hours_before,
        default_triage_mode=cast(TriageMode, profile.default_triage_mode),
        default_triage_message=profile.default_triage_message,
        onboarding_completed=profile.onboarding_completed,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@router.get("", response_model=PracticeProfileResponse)
def get_practice_profile(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PracticeProfileResponse:
    profile = practice_profile_service.get_for_tenant(db, tenant_id=context.tenant_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Configuracao da clinica ainda nao cadastrada.",
        )

    return _to_response(profile)


@router.put("", response_model=PracticeProfileResponse)
def upsert_practice_profile(
    payload: PracticeProfileUpsertRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PracticeProfileResponse:
    try:
        profile = practice_profile_service.upsert_for_tenant(
            db,
            tenant_id=context.tenant_id,
            payload=payload,
        )
    except PracticeProfileServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return _to_response(profile)
