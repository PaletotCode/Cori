from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import (
    AuthContext,
    get_auth_context,
    get_db,
    get_tenant_db,
)
from app.models import ClinicalForm, TimelineEvent
from app.schemas.form import (
    ClinicalFormCreateRequest,
    ClinicalFormCreateResponse,
    ClinicalFormDetailResponse,
    ClinicalFormListItemResponse,
    ClinicalFormPatientActionRequest,
    ClinicalFormPsychologistActionRequest,
    ClinicalFormPublicActionResponse,
    ClinicalFormPublicListResponse,
    ClinicalFormTimelineEventResponse,
    ClinicalFormUpdateRequest,
    FormQuestionResponse,
    FormsDispatchRunResponse,
    FormSectionResponse,
    FormStatus,
)
from app.services.form_service import FormServiceError, form_service
from app.services.notification_service import notification_service

router = APIRouter(tags=["forms"])


def _to_sections(form: ClinicalForm) -> list[FormSectionResponse]:
    raw_builder = form.builder_schema or {}
    raw_sections = raw_builder.get("sections", [])
    sections: list[FormSectionResponse] = []
    if not isinstance(raw_sections, list):
        return sections
    for section in raw_sections:
        if not isinstance(section, dict):
            continue
        raw_questions = section.get("questions", [])
        questions: list[FormQuestionResponse] = []
        if isinstance(raw_questions, list):
            for question in raw_questions:
                if not isinstance(question, dict):
                    continue
                questions.append(FormQuestionResponse.model_validate(question))
        sections.append(
            FormSectionResponse(
                section_id=str(section.get("section_id") or ""),
                title=str(section.get("title") or ""),
                description=cast(str | None, section.get("description")),
                questions=questions,
            )
        )
    return sections


def _to_list_item(form: ClinicalForm) -> ClinicalFormListItemResponse:
    patient_name = form.patient.full_name if form.patient is not None else "Paciente"
    return ClinicalFormListItemResponse(
        id=str(form.id),
        patient_id=str(form.patient_id),
        patient_name=patient_name,
        psychologist_id=str(form.psychologist_id),
        status=cast(FormStatus, form.status),
        title=form.title,
        subtitle=form.subtitle,
        published_at=form.published_at,
        scheduled_send_at=form.scheduled_send_at,
        assigned_at=form.assigned_at,
        submitted_at=form.submitted_at,
        reviewed_at=form.reviewed_at,
    )


def _to_detail(form: ClinicalForm) -> ClinicalFormDetailResponse:
    return ClinicalFormDetailResponse(
        **_to_list_item(form).model_dump(),
        tenant_id=str(form.tenant_id),
        header=form.header,
        sections=_to_sections(form),
        response_data=form.response_data,
        opened_at=form.opened_at,
        partial_saved_at=form.partial_saved_at,
        reviewed_by_user_id=str(form.reviewed_by_user_id)
        if form.reviewed_by_user_id is not None
        else None,
        review_note=form.review_note,
        created_at=form.created_at,
        updated_at=form.updated_at,
    )


def _to_timeline_event(event: TimelineEvent) -> ClinicalFormTimelineEventResponse:
    return ClinicalFormTimelineEventResponse(
        id=str(event.id),
        form_id=str(event.form_id) if event.form_id is not None else None,
        patient_id=str(event.patient_id) if event.patient_id is not None else None,
        event_type=event.event_type,
        actor_type=event.actor_type,
        actor_id=str(event.actor_id) if event.actor_id is not None else None,
        payload=event.payload,
        created_at=event.created_at,
    )


@router.post("/forms", response_model=ClinicalFormCreateResponse)
def create_form(
    payload: ClinicalFormCreateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ClinicalFormCreateResponse:
    try:
        created = form_service.create_form(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            payload=payload,
            patient_forms_base_url=settings.patient_forms_base_url,
        )
    except FormServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    detail = _to_detail(created.form)
    return ClinicalFormCreateResponse(
        **detail.model_dump(),
        patient_access_token=created.patient_access_token,
        patient_access_link=created.patient_access_link,
    )


@router.get("/forms", response_model=list[ClinicalFormListItemResponse])
def list_forms(
    patient_id: UUID | None = Query(default=None),
    status_filter: FormStatus | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[ClinicalFormListItemResponse]:
    forms = form_service.list_forms(
        db,
        tenant_id=context.tenant_id,
        patient_id=patient_id,
        status_filter=status_filter,
        limit=limit,
    )
    return [_to_list_item(form) for form in forms]


@router.get("/forms/responses", response_model=list[ClinicalFormDetailResponse])
def list_received_responses(
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[ClinicalFormDetailResponse]:
    forms = form_service.list_received_forms(
        db,
        tenant_id=context.tenant_id,
        limit=limit,
    )
    return [_to_detail(form) for form in forms]


@router.get("/forms/{form_id}", response_model=ClinicalFormDetailResponse)
def get_form_detail(
    form_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ClinicalFormDetailResponse:
    form = form_service.get_form_for_tenant(
        db,
        tenant_id=context.tenant_id,
        form_id=form_id,
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Formulario nao encontrado.")
    return _to_detail(form)


@router.patch("/forms/{form_id}", response_model=ClinicalFormDetailResponse)
def update_form(
    form_id: UUID,
    payload: ClinicalFormUpdateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ClinicalFormDetailResponse:
    try:
        updated = form_service.update_form(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            form_id=form_id,
            payload=payload,
        )
    except FormServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_detail(updated)


@router.post("/forms/{form_id}/actions", response_model=ClinicalFormDetailResponse)
async def apply_form_action(
    form_id: UUID,
    payload: ClinicalFormPsychologistActionRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> ClinicalFormDetailResponse:
    try:
        form = form_service.apply_psychologist_action(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            form_id=form_id,
            payload=payload,
        )
    except FormServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    if payload.action == "send":
        await notification_service.emit_domain_notification(
            db,
            tenant_id=context.tenant_id,
            patient_id=form.patient_id,
            event_type="form_assigned",
            title="Novo formulario disponivel",
            body=(
                f"Formulario '{form.title}' enviado para "
                f"{form.patient.full_name if form.patient else 'Paciente'}."
            ),
            metadata={"form_id": str(form.id)},
        )
    if payload.action == "review":
        await notification_service.emit_domain_notification(
            db,
            tenant_id=context.tenant_id,
            patient_id=form.patient_id,
            event_type="form_reviewed",
            title="Formulario revisado",
            body=f"Formulario '{form.title}' foi revisado pelo psicologo.",
            metadata={"form_id": str(form.id)},
        )
    return _to_detail(form)


@router.get(
    "/forms/{form_id}/timeline-events",
    response_model=list[ClinicalFormTimelineEventResponse],
)
def list_form_timeline_events(
    form_id: UUID,
    limit: int = Query(default=200, ge=1, le=500),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[ClinicalFormTimelineEventResponse]:
    form = form_service.get_form_for_tenant(
        db,
        tenant_id=context.tenant_id,
        form_id=form_id,
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Formulario nao encontrado.")

    events = form_service.list_form_timeline_events(
        db,
        tenant_id=context.tenant_id,
        form_id=form_id,
        limit=limit,
    )
    return [_to_timeline_event(event) for event in events]


@router.get(
    "/form-links/{patient_access_token}/forms",
    response_model=ClinicalFormPublicListResponse,
)
def public_list_forms(
    patient_access_token: str,
    db: Session = Depends(get_db),
) -> ClinicalFormPublicListResponse:
    try:
        patient, forms = form_service.list_public_forms_by_token(
            db,
            patient_access_token=patient_access_token,
        )
    except FormServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return ClinicalFormPublicListResponse(
        patient_id=str(patient.id),
        patient_name=patient.full_name,
        forms=[_to_detail(form) for form in forms],
    )


@router.post(
    "/form-links/{patient_access_token}/forms/{form_id}/actions",
    response_model=ClinicalFormPublicActionResponse,
)
async def public_apply_form_action(
    patient_access_token: str,
    form_id: UUID,
    payload: ClinicalFormPatientActionRequest,
    db: Session = Depends(get_db),
) -> ClinicalFormPublicActionResponse:
    try:
        form = form_service.apply_public_action(
            db,
            patient_access_token=patient_access_token,
            form_id=form_id,
            payload=payload,
        )
    except FormServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    if payload.action == "submit":
        await notification_service.emit_domain_notification(
            db,
            tenant_id=form.tenant_id,
            patient_id=form.patient_id,
            event_type="form_submitted",
            title="Formulario respondido",
            body=f"Paciente concluiu o formulario '{form.title}'.",
            metadata={"form_id": str(form.id)},
        )
    return ClinicalFormPublicActionResponse(form=_to_detail(form))


@router.post("/scheduler/forms-dispatch/run", response_model=FormsDispatchRunResponse)
async def run_forms_dispatch(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> FormsDispatchRunResponse:
    result = form_service.dispatch_scheduled_forms(
        db,
        tenant_id=context.tenant_id,
    )
    if result.dispatched > 0:
        for form in result.dispatched_forms:
            await notification_service.emit_domain_notification(
                db,
                tenant_id=context.tenant_id,
                patient_id=form.patient_id,
                event_type="form_assigned",
                title="Formulario agendado enviado",
                body=f"Formulario '{form.title}' ficou disponivel para resposta.",
                metadata={"form_id": str(form.id), "send_mode": "scheduled"},
            )
    return FormsDispatchRunResponse(
        processed=result.processed,
        dispatched=result.dispatched,
    )
