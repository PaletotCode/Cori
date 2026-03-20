from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext, get_auth_context, get_tenant_db
from app.models import Patient, PatientProfileChange, TimelineEvent
from app.schemas.patient import (
    PatientChangeResponse,
    PatientChangeType,
    PatientContactChannel,
    PatientCreateRequest,
    PatientDeleteResponse,
    PatientDetailResponse,
    PatientListItemResponse,
    PatientOverviewKpisResponse,
    PatientProfileSource,
    PatientSortBy,
    PatientTimelineEventResponse,
    PatientUpdateRequest,
    SortOrder,
)
from app.services.notification_service import categorize_timeline_event
from app.services.patient_service import (
    PatientServiceError,
    is_valid_whatsapp_number,
    patient_service,
)
from app.services.timeline_natural_language import (
    build_patient_change_natural_summary,
    build_timeline_natural_content,
)

router = APIRouter(prefix="/patients", tags=["patients"])


def _to_list_item(patient: Patient) -> PatientListItemResponse:
    return PatientListItemResponse(
        id=str(patient.id),
        full_name=patient.full_name,
        preferred_name=patient.preferred_name,
        email=patient.email,
        phone=patient.phone,
        preferred_contact_channel=cast(PatientContactChannel, patient.preferred_contact_channel),
        profile_source=cast(PatientProfileSource, patient.profile_source),
        whatsapp_number_valid=is_valid_whatsapp_number(patient.phone),
        updated_at=patient.updated_at,
    )


def _to_detail(patient: Patient) -> PatientDetailResponse:
    return PatientDetailResponse(
        id=str(patient.id),
        tenant_id=str(patient.tenant_id),
        full_name=patient.full_name,
        preferred_name=patient.preferred_name,
        email=patient.email,
        phone=patient.phone,
        birth_date=patient.birth_date,
        pronouns=patient.pronouns,
        emergency_contact_name=patient.emergency_contact_name,
        emergency_contact_phone=patient.emergency_contact_phone,
        preferred_contact_channel=cast(PatientContactChannel, patient.preferred_contact_channel),
        communication_notes=patient.communication_notes,
        profile_source=cast(PatientProfileSource, patient.profile_source),
        whatsapp_number_valid=is_valid_whatsapp_number(patient.phone),
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


def _to_change(change: PatientProfileChange) -> PatientChangeResponse:
    natural_summary = build_patient_change_natural_summary(
        change_type=change.change_type,
        changed_fields=change.changed_fields,
        reason=change.reason,
    )
    return PatientChangeResponse(
        id=str(change.id),
        change_type=cast(PatientChangeType, change.change_type),
        changed_fields=change.changed_fields,
        previous_data=change.previous_data,
        new_data=change.new_data,
        changed_by_user_id=str(change.changed_by_user_id)
        if change.changed_by_user_id is not None
        else None,
        reason=change.reason,
        natural_summary=natural_summary,
        created_at=change.created_at,
    )


def _to_timeline_event(event: TimelineEvent) -> PatientTimelineEventResponse:
    resolved_category = _resolve_patient_timeline_category(event)
    natural = build_timeline_natural_content(
        category=resolved_category,
        event_type=event.event_type,
        actor_type=event.actor_type,
        payload=event.payload,
    )
    return PatientTimelineEventResponse(
        id=str(event.id),
        event_type=event.event_type,
        category_label=natural.category_label,
        actor_type=event.actor_type,
        actor_label=natural.actor_label,
        actor_id=str(event.actor_id) if event.actor_id is not None else None,
        payload=event.payload,
        natural_title=natural.title,
        natural_event_label=natural.event_label,
        natural_detail=natural.detail,
        created_at=event.created_at,
    )


def _resolve_patient_timeline_category(event: TimelineEvent) -> str:
    event_type = event.event_type.lower()
    if event_type.startswith("patient_") or event_type.startswith("intake_"):
        return "profile"
    if event_type.startswith("payment_"):
        return "payments"
    return categorize_timeline_event(event)


@router.post("", response_model=PatientDetailResponse)
def create_patient(
    payload: PatientCreateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PatientDetailResponse:
    try:
        patient = patient_service.create_patient(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            payload=payload,
        )
    except PatientServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return _to_detail(patient)


@router.get("", response_model=list[PatientListItemResponse])
def list_patients(
    search: str | None = Query(default=None),
    preferred_contact_channel: PatientContactChannel | None = Query(default=None),
    has_whatsapp: bool | None = Query(default=None),
    sort_by: PatientSortBy = Query(default="updated_at"),
    sort_order: SortOrder = Query(default="desc"),
    limit: int | None = Query(default=None, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[PatientListItemResponse]:
    patients = patient_service.list_patients(
        db,
        tenant_id=context.tenant_id,
        search=search,
        preferred_contact_channel=preferred_contact_channel,
        has_whatsapp=has_whatsapp,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=limit,
        offset=offset,
    )
    return [_to_list_item(patient) for patient in patients]


@router.get("/{patient_id}", response_model=PatientDetailResponse)
def get_patient_detail(
    patient_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PatientDetailResponse:
    patient = patient_service.get_patient_for_tenant(
        db,
        tenant_id=context.tenant_id,
        patient_id=patient_id,
    )
    if patient is None:
        raise HTTPException(status_code=404, detail="Paciente nao encontrado.")

    return _to_detail(patient)


@router.put("/{patient_id}", response_model=PatientDetailResponse)
def update_patient(
    patient_id: UUID,
    payload: PatientUpdateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PatientDetailResponse:
    try:
        patient = patient_service.update_patient(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            patient_id=patient_id,
            payload=payload,
        )
    except PatientServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return _to_detail(patient)


@router.delete("/{patient_id}", response_model=PatientDeleteResponse)
def archive_patient(
    patient_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PatientDeleteResponse:
    try:
        patient = patient_service.archive_patient(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            patient_id=patient_id,
        )
    except PatientServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    if patient.archived_at is None:
        raise HTTPException(status_code=500, detail="Falha ao arquivar paciente.")
    return PatientDeleteResponse(patient_id=str(patient.id), archived_at=patient.archived_at)


@router.get("/{patient_id}/changes", response_model=list[PatientChangeResponse])
def list_patient_changes(
    patient_id: UUID,
    limit: int = Query(default=120, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[PatientChangeResponse]:
    patient = patient_service.get_patient_for_tenant(
        db,
        tenant_id=context.tenant_id,
        patient_id=patient_id,
        include_archived=True,
    )
    if patient is None:
        raise HTTPException(status_code=404, detail="Paciente nao encontrado.")

    changes = patient_service.list_profile_changes(
        db,
        tenant_id=context.tenant_id,
        patient_id=patient_id,
        limit=limit,
    )
    return [_to_change(change) for change in changes]


@router.get("/{patient_id}/timeline-events", response_model=list[PatientTimelineEventResponse])
def list_patient_timeline_events(
    patient_id: UUID,
    limit: int = Query(default=120, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[PatientTimelineEventResponse]:
    patient = patient_service.get_patient_for_tenant(
        db,
        tenant_id=context.tenant_id,
        patient_id=patient_id,
        include_archived=True,
    )
    if patient is None:
        raise HTTPException(status_code=404, detail="Paciente nao encontrado.")

    events = patient_service.list_timeline_events(
        db,
        tenant_id=context.tenant_id,
        patient_id=patient_id,
        limit=limit,
    )
    return [_to_timeline_event(event) for event in events]


@router.get("/{patient_id}/overview-kpis", response_model=PatientOverviewKpisResponse)
def get_patient_overview_kpis(
    patient_id: UUID,
    timezone: str | None = Query(default=None),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PatientOverviewKpisResponse:
    try:
        return patient_service.get_patient_overview_kpis(
            db,
            tenant_id=context.tenant_id,
            patient_id=patient_id,
            timezone_name=timezone,
        )
    except PatientServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
