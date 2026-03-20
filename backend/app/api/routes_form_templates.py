from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext, get_auth_context, get_tenant_db
from app.models import ClinicalForm, FormTemplate
from app.schemas.form import (
    ClinicalFormDetailResponse,
    FormQuestionResponse,
    FormSectionResponse,
    FormStatus,
)
from app.schemas.template import (
    FormTemplateAssignRequest,
    FormTemplateAssignResponse,
    FormTemplateCreateRequest,
    FormTemplateResponse,
    FormTemplateUpdateRequest,
)
from app.services.notification_service import notification_service
from app.services.template_assignment_service import (
    TemplateAssignmentServiceError,
    template_assignment_service,
)

router = APIRouter(tags=["form-templates"])


def _to_template_sections(template: FormTemplate) -> list[FormSectionResponse]:
    raw_sections = template.builder_schema.get("sections", [])
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
                if isinstance(question, dict):
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


def _to_template_response(template: FormTemplate) -> FormTemplateResponse:
    return FormTemplateResponse(
        id=str(template.id),
        tenant_id=str(template.tenant_id),
        psychologist_id=str(template.psychologist_id),
        title=template.title,
        subtitle=template.subtitle,
        header=template.header,
        sections=_to_template_sections(template),
        created_at=template.created_at,
        updated_at=template.updated_at,
        archived_at=template.archived_at,
    )


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


def _to_form_detail(form: ClinicalForm) -> ClinicalFormDetailResponse:
    patient_name = form.patient.full_name if form.patient is not None else "Paciente"
    return ClinicalFormDetailResponse(
        id=str(form.id),
        patient_id=str(form.patient_id),
        patient_name=patient_name,
        psychologist_id=str(form.psychologist_id),
        source_template_id=str(form.source_template_id)
        if form.source_template_id is not None
        else None,
        status=cast(FormStatus, form.status),
        title=form.title,
        subtitle=form.subtitle,
        published_at=form.published_at,
        scheduled_send_at=form.scheduled_send_at,
        assigned_at=form.assigned_at,
        submitted_at=form.submitted_at,
        reviewed_at=form.reviewed_at,
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


@router.post("/form-templates", response_model=FormTemplateResponse)
def create_form_template(
    payload: FormTemplateCreateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> FormTemplateResponse:
    try:
        template = template_assignment_service.create_form_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            payload=payload,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_template_response(template)


@router.get("/form-templates", response_model=list[FormTemplateResponse])
def list_form_templates(
    include_archived: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> list[FormTemplateResponse]:
    templates = template_assignment_service.list_form_templates(
        db,
        tenant_id=context.tenant_id,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return [_to_template_response(item) for item in templates]


@router.get("/form-templates/{template_id}", response_model=FormTemplateResponse)
def get_form_template(
    template_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> FormTemplateResponse:
    template = template_assignment_service.get_form_template(
        db,
        tenant_id=context.tenant_id,
        template_id=template_id,
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template de formulario nao encontrado.")
    return _to_template_response(template)


@router.patch("/form-templates/{template_id}", response_model=FormTemplateResponse)
def patch_form_template(
    template_id: UUID,
    payload: FormTemplateUpdateRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> FormTemplateResponse:
    try:
        template = template_assignment_service.update_form_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            template_id=template_id,
            payload=payload,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_template_response(template)


@router.delete("/form-templates/{template_id}", response_model=FormTemplateResponse)
def archive_form_template(
    template_id: UUID,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> FormTemplateResponse:
    try:
        template = template_assignment_service.archive_form_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            template_id=template_id,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_template_response(template)


@router.post(
    "/form-templates/{template_id}/assign",
    response_model=FormTemplateAssignResponse,
)
async def assign_form_template(
    template_id: UUID,
    payload: FormTemplateAssignRequest,
    idempotency_key: str = Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=200,
    ),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> FormTemplateAssignResponse:
    try:
        result = template_assignment_service.assign_form_template(
            db,
            tenant_id=context.tenant_id,
            actor_user_id=context.user_id,
            template_id=template_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )
    except TemplateAssignmentServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    if not result.replayed and result.form.status == "assigned":
        await notification_service.emit_domain_notification(
            db,
            tenant_id=context.tenant_id,
            patient_id=result.form.patient_id,
            event_type="form_assigned",
            title="Novo formulario disponivel",
            body=f"Formulario '{result.form.title}' enviado para voce.",
            metadata={
                "form_id": str(result.form.id),
                "source_template_id": str(result.form.source_template_id)
                if result.form.source_template_id is not None
                else None,
                "send_mode": payload.send_mode,
                "template_id": str(template_id),
            },
        )

    return FormTemplateAssignResponse(
        idempotency_replayed=result.replayed,
        form=_to_form_detail(result.form),
    )
