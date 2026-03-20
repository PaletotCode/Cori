from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import (
    Activity,
    ClinicalForm,
    Patient,
    Psychologist,
    Session as ClinicalSession,
    Tenant,
    TimelineEvent,
    User,
)
from app.schemas.activity import (
    ActivityCreateRequest,
    ActivityPatientActionRequest,
    ActivityPsychologistActionRequest,
)
from app.schemas.form import (
    ClinicalFormCreateRequest,
    ClinicalFormPatientActionRequest,
    ClinicalFormPsychologistActionRequest,
    FormQuestionRequest,
    FormSectionRequest,
)
from app.schemas.session import SessionActionRequest, SessionCreateRequest
from app.services.activity_service import activity_service
from app.services.form_service import form_service
from app.services.session_service import session_service

DEFAULT_PATIENTS_ARTIFACT = "artifacts/seed/patients_frontend_injection_summary.json"
DEFAULT_OUTPUT_ARTIFACT = "artifacts/seed/frontend_workload_entities_injection_summary.json"
DEFAULT_SEED_TAG = "FRONTEND_LOAD_ENTITIES_V1"


@dataclass(frozen=True)
class InjectionContext:
    tenant: Tenant
    actor: User
    psychologist: Psychologist


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Injeta sessoes, atividades e formularios em pacientes de carga para estressar o frontend."
        )
    )
    parser.add_argument(
        "--patients-artifact",
        type=str,
        default=DEFAULT_PATIENTS_ARTIFACT,
        help="Arquivo JSON do seed de pacientes com patient_ids e archived_patient_ids.",
    )
    parser.add_argument(
        "--artifact",
        type=str,
        default=DEFAULT_OUTPUT_ARTIFACT,
        help="Arquivo JSON de saida com resumo da injecao.",
    )
    parser.add_argument(
        "--tenant-name",
        type=str,
        default=None,
        help="Nome do tenant alvo. Se omitido, tenta usar o tenant do arquivo de pacientes.",
    )
    parser.add_argument(
        "--actor-email",
        type=str,
        default=None,
        help="Email do usuario psicologo ator da injecao.",
    )
    parser.add_argument(
        "--seed-tag",
        type=str,
        default=DEFAULT_SEED_TAG,
        help="Tag textual usada para identificar os registros injetados.",
    )
    parser.add_argument(
        "--sessions-per-patient",
        type=int,
        default=6,
        help="Quantidade de sessoes por paciente.",
    )
    parser.add_argument(
        "--activities-per-patient",
        type=int,
        default=8,
        help="Quantidade de atividades por paciente.",
    )
    parser.add_argument(
        "--forms-per-patient",
        type=int,
        default=8,
        help="Quantidade de formularios por paciente.",
    )
    parser.add_argument(
        "--patient-sessions-base-url",
        type=str,
        default="https://app.cori.dev/patient/sessions",
        help="Base URL para links publicos de sessoes.",
    )
    parser.add_argument(
        "--patient-activities-base-url",
        type=str,
        default="https://app.cori.dev/patient/activities",
        help="Base URL para links publicos de atividades.",
    )
    parser.add_argument(
        "--patient-forms-base-url",
        type=str,
        default="https://app.cori.dev/patient/forms",
        help="Base URL para links publicos de formularios.",
    )
    parser.add_argument(
        "--session-value-base-cents",
        type=int,
        default=18000,
        help="Valor base manual por sessao (centavos), usado no texto da nota.",
    )
    parser.add_argument(
        "--session-value-step-cents",
        type=int,
        default=750,
        help="Incremento por sessao para variar os valores manuais (centavos).",
    )
    parser.add_argument(
        "--replace-existing",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Remove dados de injecoes anteriores com a mesma tag antes de inserir novos.",
    )
    return parser.parse_args()


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _set_current_tenant(db: Session, *, tenant_id: UUID) -> None:
    db.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant_id)},
    )


def _load_patients_artifact(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise RuntimeError(
            f"Arquivo de pacientes nao encontrado: {path}. Execute o seed de pacientes primeiro."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_patient_ids(payload: dict[str, Any]) -> list[UUID]:
    seen: set[UUID] = set()
    resolved: list[UUID] = []
    for field in ("patient_ids", "archived_patient_ids"):
        for raw in payload.get(field, []):
            patient_id = UUID(str(raw))
            if patient_id in seen:
                continue
            seen.add(patient_id)
            resolved.append(patient_id)
    return resolved


def _resolve_tenant(
    db: Session,
    *,
    tenant_name: str | None,
    artifact_payload: dict[str, Any],
    patient_ids: list[UUID],
) -> Tenant:
    if tenant_name:
        tenant = db.scalar(select(Tenant).where(Tenant.name == tenant_name))
        if tenant is not None:
            return tenant

    artifact_tenant_id = artifact_payload.get("tenant_id")
    if artifact_tenant_id:
        tenant = db.scalar(select(Tenant).where(Tenant.id == UUID(str(artifact_tenant_id))))
        if tenant is not None:
            return tenant

    if patient_ids:
        tenant = db.scalar(
            select(Tenant)
            .join(Patient, Patient.tenant_id == Tenant.id)
            .where(Patient.id == patient_ids[0])
        )
        if tenant is not None:
            return tenant

    fallback = db.scalar(select(Tenant).order_by(Tenant.created_at.asc()).limit(1))
    if fallback is None:
        raise RuntimeError("Nenhum tenant encontrado para injecao.")
    return fallback


def _resolve_actor_and_psychologist(
    db: Session,
    *,
    tenant_id: UUID,
    actor_email: str | None,
    artifact_payload: dict[str, Any],
) -> tuple[User, Psychologist]:
    preferred_email = actor_email or artifact_payload.get("actor_user_email")
    actor: User | None = None

    if preferred_email:
        actor = db.scalar(
            select(User).where(
                User.tenant_id == tenant_id,
                User.email == str(preferred_email).strip().lower(),
                User.is_active.is_(True),
            )
        )

    if actor is None:
        actor = db.scalar(
            select(User)
            .join(Psychologist, Psychologist.user_id == User.id)
            .where(
                User.tenant_id == tenant_id,
                User.is_active.is_(True),
                Psychologist.tenant_id == tenant_id,
            )
            .order_by(User.created_at.asc())
            .limit(1)
        )

    if actor is None:
        raise RuntimeError("Nao foi possivel resolver usuario ator ativo no tenant alvo.")

    psychologist = db.scalar(
        select(Psychologist).where(
            Psychologist.tenant_id == tenant_id,
            Psychologist.user_id == actor.id,
        )
    )
    if psychologist is None:
        raise RuntimeError(
            f"Usuario ator {actor.email} nao possui registro de psicologo no tenant alvo."
        )
    return actor, psychologist


def _cleanup_previous_seed_data(
    db: Session,
    *,
    tenant_id: UUID,
    patient_ids: list[UUID],
    seed_tag: str,
) -> dict[str, int]:
    if not patient_ids:
        return {"sessions_deleted": 0, "activities_deleted": 0, "forms_deleted": 0, "timeline_deleted": 0}

    notes_filter = f"[{seed_tag}]%"
    title_filter = f"[{seed_tag}]%"

    session_ids = list(
        db.scalars(
            select(ClinicalSession.id).where(
                ClinicalSession.tenant_id == tenant_id,
                ClinicalSession.patient_id.in_(patient_ids),
                ClinicalSession.notes.is_not(None),
                ClinicalSession.notes.like(notes_filter),
            )
        ).all()
    )
    activity_ids = list(
        db.scalars(
            select(Activity.id).where(
                Activity.tenant_id == tenant_id,
                Activity.patient_id.in_(patient_ids),
                Activity.title.like(title_filter),
            )
        ).all()
    )
    form_ids = list(
        db.scalars(
            select(ClinicalForm.id).where(
                ClinicalForm.tenant_id == tenant_id,
                ClinicalForm.patient_id.in_(patient_ids),
                ClinicalForm.title.like(title_filter),
            )
        ).all()
    )

    timeline_deleted = 0
    if session_ids:
        timeline_deleted += db.execute(
            delete(TimelineEvent).where(
                TimelineEvent.tenant_id == tenant_id,
                TimelineEvent.session_id.in_(session_ids),
            )
        ).rowcount or 0
    if activity_ids:
        timeline_deleted += db.execute(
            delete(TimelineEvent).where(
                TimelineEvent.tenant_id == tenant_id,
                TimelineEvent.activity_id.in_(activity_ids),
            )
        ).rowcount or 0
    if form_ids:
        timeline_deleted += db.execute(
            delete(TimelineEvent).where(
                TimelineEvent.tenant_id == tenant_id,
                TimelineEvent.form_id.in_(form_ids),
            )
        ).rowcount or 0

    sessions_deleted = 0
    if session_ids:
        sessions_deleted = (
            db.execute(delete(ClinicalSession).where(ClinicalSession.id.in_(session_ids))).rowcount or 0
        )

    activities_deleted = 0
    if activity_ids:
        activities_deleted = (
            db.execute(delete(Activity).where(Activity.id.in_(activity_ids))).rowcount or 0
        )

    forms_deleted = 0
    if form_ids:
        forms_deleted = db.execute(delete(ClinicalForm).where(ClinicalForm.id.in_(form_ids))).rowcount or 0

    return {
        "sessions_deleted": int(sessions_deleted),
        "activities_deleted": int(activities_deleted),
        "forms_deleted": int(forms_deleted),
        "timeline_deleted": int(timeline_deleted),
    }


def _build_form_sections(seed_tag: str, *, patient_index: int, form_index: int) -> list[FormSectionRequest]:
    tag_suffix = f"{patient_index + 1:02d}-{form_index + 1:02d}"
    return [
        FormSectionRequest(
            section_id=f"emocional_{tag_suffix}",
            title=f"Check-in Emocional {tag_suffix}",
            description=f"[{seed_tag}] Monitoramento de estado emocional.",
            questions=[
                FormQuestionRequest(
                    question_id=f"q_mood_{tag_suffix}",
                    label="Como voce avalia seu humor hoje?",
                    field_type="scale",
                    required=True,
                    scale_min=0,
                    scale_max=10,
                ),
                FormQuestionRequest(
                    question_id=f"q_note_{tag_suffix}",
                    label="Escreva um resumo breve do seu dia.",
                    field_type="long_text",
                    required=True,
                ),
                FormQuestionRequest(
                    question_id=f"q_focus_{tag_suffix}",
                    label="Em qual area quer focar esta semana?",
                    field_type="multiple_choice",
                    required=False,
                    options=["Sono", "Ansiedade", "Rotina", "Relacionamentos"],
                ),
            ],
        ),
        FormSectionRequest(
            section_id=f"habitos_{tag_suffix}",
            title=f"Habitos Recentes {tag_suffix}",
            description="Perguntas complementares para variacao visual.",
            questions=[
                FormQuestionRequest(
                    question_id=f"q_practices_{tag_suffix}",
                    label="Quais praticas realizou desde a ultima sessao?",
                    field_type="checkbox",
                    required=False,
                    options=["Respiracao", "Meditacao", "Jornal", "Caminhada"],
                ),
                FormQuestionRequest(
                    question_id=f"q_registered_at_{tag_suffix}",
                    label="Quando registrou este formulario?",
                    field_type="date_time",
                    required=False,
                ),
            ],
        ),
    ]


def _build_partial_answers(*, patient_index: int, form_index: int) -> dict[str, object]:
    suffix = f"{patient_index + 1:02d}-{form_index + 1:02d}"
    return {
        f"q_note_{suffix}": "Registro parcial de progresso para acompanhamento.",
    }


def _build_complete_answers(*, patient_index: int, form_index: int) -> dict[str, object]:
    suffix = f"{patient_index + 1:02d}-{form_index + 1:02d}"
    return {
        f"q_mood_{suffix}": int((patient_index + form_index) % 11),
        f"q_note_{suffix}": "Registro completo enviado para revisao do psicologo.",
        f"q_focus_{suffix}": "Rotina",
        f"q_practices_{suffix}": ["Respiracao", "Jornal"],
        f"q_registered_at_{suffix}": _utcnow().isoformat(),
    }


def _inject_sessions_for_patient(
    db: Session,
    *,
    patient: Patient,
    patient_index: int,
    context: InjectionContext,
    args: argparse.Namespace,
    seed_tag: str,
) -> list[UUID]:
    created_ids: list[UUID] = []
    now = _utcnow()
    scenarios = [
        "scheduled",
        "confirmed_psychologist",
        "confirmed_patient",
        "rescheduled",
        "canceled",
        "completed",
    ]

    for i in range(args.sessions_per_patient):
        scenario = scenarios[i % len(scenarios)]
        start_base = now + timedelta(days=2 + (patient_index % 4), hours=2 * (i % 3))
        if scenario == "completed":
            start_base = now - timedelta(days=2 + (patient_index % 3), hours=i % 2)
        end_base = start_base + timedelta(minutes=50)
        session_value_cents = args.session_value_base_cents + (
            (patient_index + i) % 11
        ) * args.session_value_step_cents
        session_value_brl = session_value_cents / 100

        payload = SessionCreateRequest(
            patient_id=str(patient.id),
            scheduled_start_at=start_base,
            scheduled_end_at=end_base,
            location_mode=["online", "presential", "hybrid"][i % 3],
            meeting_link=f"https://meet.cori.dev/{seed_tag.lower()}/{patient.id}/{i}",
            notes=(
                f"[{seed_tag}] Sessao {i + 1:02d} - {scenario} "
                f"para carga visual frontend. "
                f"Valor manual: R$ {session_value_brl:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            ),
        )
        created = session_service.create_session(
            db,
            tenant_id=context.tenant.id,
            actor_user_id=context.actor.id,
            payload=payload,
            patient_sessions_base_url=args.patient_sessions_base_url,
        )
        session = created.session
        created_ids.append(session.id)

        if scenario == "confirmed_psychologist":
            session_service.apply_action(
                db,
                tenant_id=context.tenant.id,
                actor_user_id=context.actor.id,
                session_id=session.id,
                payload=SessionActionRequest(action="confirm"),
            )
            continue

        if scenario == "confirmed_patient":
            session_service.confirm_public_session(
                db,
                confirmation_token=created.confirmation_token,
                session_id=session.id,
            )
            continue

        if scenario == "rescheduled":
            session_service.apply_action(
                db,
                tenant_id=context.tenant.id,
                actor_user_id=context.actor.id,
                session_id=session.id,
                payload=SessionActionRequest(
                    action="reschedule",
                    scheduled_start_at=start_base + timedelta(days=1),
                    scheduled_end_at=end_base + timedelta(days=1),
                    reason=f"[{seed_tag}] Ajuste de agenda para carga visual.",
                ),
            )
            continue

        if scenario == "canceled":
            session_service.apply_action(
                db,
                tenant_id=context.tenant.id,
                actor_user_id=context.actor.id,
                session_id=session.id,
                payload=SessionActionRequest(
                    action="cancel",
                    reason=f"[{seed_tag}] Cancelamento simulado para variacao de estado.",
                ),
            )
            continue

        if scenario == "completed":
            session_service.apply_action(
                db,
                tenant_id=context.tenant.id,
                actor_user_id=context.actor.id,
                session_id=session.id,
                payload=SessionActionRequest(action="complete"),
            )

    return created_ids


def _inject_activities_for_patient(
    db: Session,
    *,
    patient: Patient,
    patient_index: int,
    context: InjectionContext,
    args: argparse.Namespace,
    seed_tag: str,
) -> list[UUID]:
    created_ids: list[UUID] = []
    now = _utcnow()
    scenarios = [
        "assigned",
        "opened",
        "in_progress",
        "paused",
        "completed",
        "canceled",
        "overdue",
        "recurring_assigned",
    ]
    activity_types = ["simple_task", "guided_meditation", "habit", "document_reading"]

    for i in range(args.activities_per_patient):
        scenario = scenarios[i % len(scenarios)]
        activity_type = activity_types[i % len(activity_types)]

        due_at = now + timedelta(days=3 + (patient_index % 5), hours=i)
        if scenario == "overdue":
            due_at = now - timedelta(days=2 + (patient_index % 2), hours=i % 2)

        document_url = None
        if activity_type == "document_reading":
            document_url = f"https://cdn.cori.dev/docs/{seed_tag.lower()}-{patient_index + 1:02d}-{i + 1:02d}.pdf"

        recurrence_rule = "none"
        recurrence_interval = 1
        recurrence_end_at = None
        if scenario == "recurring_assigned":
            recurrence_rule = "daily"
            recurrence_interval = 2
            recurrence_end_at = due_at + timedelta(days=14)

        create_payload = ActivityCreateRequest(
            patient_id=str(patient.id),
            activity_type=activity_type,
            title=f"[{seed_tag}] Atividade {patient_index + 1:02d}-{i + 1:02d} ({scenario})",
            description="Carga visual para listas, cards, filtros e historico.",
            instructions=(
                "Complete a atividade seguindo o passo a passo indicado no aplicativo. "
                f"Cenario: {scenario}."
            ),
            document_url=document_url,
            configuration={
                "seed_tag": seed_tag,
                "scenario": scenario,
                "patient_index": patient_index + 1,
                "activity_index": i + 1,
            },
            due_at=due_at,
            recurrence_rule=recurrence_rule,
            recurrence_interval=recurrence_interval,
            recurrence_end_at=recurrence_end_at,
        )
        created = activity_service.create_activity(
            db,
            tenant_id=context.tenant.id,
            actor_user_id=context.actor.id,
            payload=create_payload,
            patient_activities_base_url=args.patient_activities_base_url,
        )
        activity = created.activity
        created_ids.append(activity.id)

        if scenario == "opened":
            activity_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                activity_id=activity.id,
                payload=ActivityPatientActionRequest(action="open"),
                patient_activities_base_url=args.patient_activities_base_url,
            )
            continue

        if scenario == "in_progress":
            activity_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                activity_id=activity.id,
                payload=ActivityPatientActionRequest(action="start"),
                patient_activities_base_url=args.patient_activities_base_url,
            )
            continue

        if scenario == "paused":
            activity_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                activity_id=activity.id,
                payload=ActivityPatientActionRequest(action="start"),
                patient_activities_base_url=args.patient_activities_base_url,
            )
            activity_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                activity_id=activity.id,
                payload=ActivityPatientActionRequest(action="pause"),
                patient_activities_base_url=args.patient_activities_base_url,
            )
            continue

        if scenario == "completed":
            activity_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                activity_id=activity.id,
                payload=ActivityPatientActionRequest(action="start"),
                patient_activities_base_url=args.patient_activities_base_url,
            )
            activity_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                activity_id=activity.id,
                payload=ActivityPatientActionRequest(
                    action="complete",
                    feedback_note="Concluida durante script de carga visual.",
                ),
                patient_activities_base_url=args.patient_activities_base_url,
            )
            continue

        if scenario == "canceled":
            activity_service.apply_psychologist_action(
                db,
                tenant_id=context.tenant.id,
                actor_user_id=context.actor.id,
                activity_id=activity.id,
                payload=ActivityPsychologistActionRequest(
                    action="cancel",
                    reason=f"[{seed_tag}] Cancelamento para variacao visual.",
                ),
            )

    return created_ids


def _inject_forms_for_patient(
    db: Session,
    *,
    patient: Patient,
    patient_index: int,
    context: InjectionContext,
    args: argparse.Namespace,
    seed_tag: str,
) -> list[UUID]:
    created_ids: list[UUID] = []
    now = _utcnow()
    scenarios = [
        "draft",
        "published",
        "scheduled",
        "assigned",
        "opened",
        "partial_saved",
        "submitted",
        "reviewed",
    ]

    for i in range(args.forms_per_patient):
        scenario = scenarios[i % len(scenarios)]
        sections = _build_form_sections(seed_tag, patient_index=patient_index, form_index=i)
        form_payload = ClinicalFormCreateRequest(
            patient_id=str(patient.id),
            title=f"[{seed_tag}] Formulario {patient_index + 1:02d}-{i + 1:02d} ({scenario})",
            subtitle="Formulario de carga visual para front-end",
            header="Resposta clinica simulada para validacao de listas, detalhes e timeline.",
            sections=sections,
        )
        created = form_service.create_form(
            db,
            tenant_id=context.tenant.id,
            actor_user_id=context.actor.id,
            payload=form_payload,
            patient_forms_base_url=args.patient_forms_base_url,
        )
        form = created.form
        created_ids.append(form.id)

        if scenario == "draft":
            continue

        form_service.apply_psychologist_action(
            db,
            tenant_id=context.tenant.id,
            actor_user_id=context.actor.id,
            form_id=form.id,
            payload=ClinicalFormPsychologistActionRequest(action="publish"),
        )

        if scenario == "published":
            continue

        if scenario == "scheduled":
            form_service.apply_psychologist_action(
                db,
                tenant_id=context.tenant.id,
                actor_user_id=context.actor.id,
                form_id=form.id,
                payload=ClinicalFormPsychologistActionRequest(
                    action="schedule",
                    scheduled_send_at=now + timedelta(days=3 + (i % 3)),
                ),
            )
            continue

        form_service.apply_psychologist_action(
            db,
            tenant_id=context.tenant.id,
            actor_user_id=context.actor.id,
            form_id=form.id,
            payload=ClinicalFormPsychologistActionRequest(action="send"),
        )

        if scenario == "assigned":
            continue

        if scenario == "opened":
            form_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                form_id=form.id,
                payload=ClinicalFormPatientActionRequest(action="open"),
            )
            continue

        if scenario == "partial_saved":
            form_service.apply_public_action(
                db,
                patient_access_token=created.patient_access_token,
                form_id=form.id,
                payload=ClinicalFormPatientActionRequest(
                    action="partial_save",
                    answers=_build_partial_answers(
                        patient_index=patient_index,
                        form_index=i,
                    ),
                ),
            )
            continue

        form_service.apply_public_action(
            db,
            patient_access_token=created.patient_access_token,
            form_id=form.id,
            payload=ClinicalFormPatientActionRequest(
                action="submit",
                answers=_build_complete_answers(
                    patient_index=patient_index,
                    form_index=i,
                ),
            ),
        )

        if scenario == "reviewed":
            form_service.apply_psychologist_action(
                db,
                tenant_id=context.tenant.id,
                actor_user_id=context.actor.id,
                form_id=form.id,
                payload=ClinicalFormPsychologistActionRequest(
                    action="review",
                    review_note=f"[{seed_tag}] Revisao automatica de formulario.",
                ),
            )

    return created_ids


def _collect_status_counts(
    db: Session,
    *,
    session_ids: list[UUID],
    activity_ids: list[UUID],
    form_ids: list[UUID],
) -> dict[str, dict[str, int]]:
    session_statuses = Counter(
        db.execute(
            select(ClinicalSession.status).where(ClinicalSession.id.in_(session_ids))
        ).scalars().all()
    ) if session_ids else Counter()
    activity_statuses = Counter(
        db.execute(
            select(Activity.status).where(Activity.id.in_(activity_ids))
        ).scalars().all()
    ) if activity_ids else Counter()
    form_statuses = Counter(
        db.execute(
            select(ClinicalForm.status).where(ClinicalForm.id.in_(form_ids))
        ).scalars().all()
    ) if form_ids else Counter()

    return {
        "sessions": dict(sorted(session_statuses.items())),
        "activities": dict(sorted(activity_statuses.items())),
        "forms": dict(sorted(form_statuses.items())),
    }


def _collect_totals_by_tag(
    db: Session,
    *,
    tenant_id: UUID,
    seed_tag: str,
) -> dict[str, int]:
    title_filter = f"[{seed_tag}]%"
    notes_filter = f"[{seed_tag}]%"

    sessions_total = db.execute(
        select(text("count(*)")).select_from(ClinicalSession).where(
            ClinicalSession.tenant_id == tenant_id,
            ClinicalSession.notes.is_not(None),
            ClinicalSession.notes.like(notes_filter),
        )
    ).scalar_one()
    activities_total = db.execute(
        select(text("count(*)")).select_from(Activity).where(
            Activity.tenant_id == tenant_id,
            Activity.title.like(title_filter),
        )
    ).scalar_one()
    forms_total = db.execute(
        select(text("count(*)")).select_from(ClinicalForm).where(
            ClinicalForm.tenant_id == tenant_id,
            ClinicalForm.title.like(title_filter),
        )
    ).scalar_one()

    return {
        "sessions": int(sessions_total),
        "activities": int(activities_total),
        "forms": int(forms_total),
    }


def main() -> None:
    args = parse_args()
    if args.sessions_per_patient <= 0:
        raise RuntimeError("--sessions-per-patient deve ser > 0.")
    if args.activities_per_patient <= 0:
        raise RuntimeError("--activities-per-patient deve ser > 0.")
    if args.forms_per_patient <= 0:
        raise RuntimeError("--forms-per-patient deve ser > 0.")

    patients_artifact_path = Path(args.patients_artifact)
    artifact_payload = _load_patients_artifact(patients_artifact_path)
    patient_ids = _resolve_patient_ids(artifact_payload)
    if not patient_ids:
        raise RuntimeError(
            f"Nenhum patient_id encontrado em {patients_artifact_path}."
        )

    started_at = _utcnow()
    with SessionLocal() as db:
        tenant = _resolve_tenant(
            db,
            tenant_name=args.tenant_name,
            artifact_payload=artifact_payload,
            patient_ids=patient_ids,
        )
        actor, psychologist = _resolve_actor_and_psychologist(
            db,
            tenant_id=tenant.id,
            actor_email=args.actor_email,
            artifact_payload=artifact_payload,
        )
        context = InjectionContext(tenant=tenant, actor=actor, psychologist=psychologist)

        _set_current_tenant(db, tenant_id=tenant.id)

        patients = list(
            db.scalars(
                select(Patient)
                .where(
                    Patient.tenant_id == tenant.id,
                    Patient.id.in_(patient_ids),
                )
                .order_by(Patient.full_name.asc())
            ).all()
        )
        if len(patients) == 0:
            raise RuntimeError("Nenhum paciente correspondente foi encontrado no tenant alvo.")

        cleanup_summary = {
            "sessions_deleted": 0,
            "activities_deleted": 0,
            "forms_deleted": 0,
            "timeline_deleted": 0,
        }
        if args.replace_existing:
            cleanup_summary = _cleanup_previous_seed_data(
                db,
                tenant_id=tenant.id,
                patient_ids=[patient.id for patient in patients],
                seed_tag=args.seed_tag,
            )
            db.flush()

        created_session_ids: list[UUID] = []
        created_activity_ids: list[UUID] = []
        created_form_ids: list[UUID] = []
        reactivated_archived_patients = 0

        for patient_index, patient in enumerate(patients):
            archived_original = patient.archived_at
            archived_by_original = patient.archived_by_user_id
            if archived_original is not None:
                patient.archived_at = None
                patient.archived_by_user_id = None
                reactivated_archived_patients += 1
                db.flush()

            try:
                created_session_ids.extend(
                    _inject_sessions_for_patient(
                        db,
                        patient=patient,
                        patient_index=patient_index,
                        context=context,
                        args=args,
                        seed_tag=args.seed_tag,
                    )
                )
                created_activity_ids.extend(
                    _inject_activities_for_patient(
                        db,
                        patient=patient,
                        patient_index=patient_index,
                        context=context,
                        args=args,
                        seed_tag=args.seed_tag,
                    )
                )
                created_form_ids.extend(
                    _inject_forms_for_patient(
                        db,
                        patient=patient,
                        patient_index=patient_index,
                        context=context,
                        args=args,
                        seed_tag=args.seed_tag,
                    )
                )
            finally:
                if archived_original is not None:
                    patient.archived_at = archived_original
                    patient.archived_by_user_id = archived_by_original

        overdue_result = activity_service.mark_overdue_activities(
            db,
            tenant_id=tenant.id,
        )

        status_counts = _collect_status_counts(
            db,
            session_ids=created_session_ids,
            activity_ids=created_activity_ids,
            form_ids=created_form_ids,
        )
        totals_by_tag = _collect_totals_by_tag(db, tenant_id=tenant.id, seed_tag=args.seed_tag)

        db.commit()

    finished_at = _utcnow()
    result_payload = {
        "seed_tag": args.seed_tag,
        "requested": {
            "sessions_per_patient": args.sessions_per_patient,
            "activities_per_patient": args.activities_per_patient,
            "forms_per_patient": args.forms_per_patient,
            "replace_existing": args.replace_existing,
        },
        "tenant": {
            "id": str(context.tenant.id),
            "name": context.tenant.name,
        },
        "actor": {
            "user_id": str(context.actor.id),
            "email": context.actor.email,
            "psychologist_id": str(context.psychologist.id),
        },
        "patients": {
            "total_targeted": len(patient_ids),
            "resolved_in_tenant": len(patients),
            "reactivated_temporarily_for_injection": reactivated_archived_patients,
            "ids": [str(patient.id) for patient in patients],
        },
        "created": {
            "sessions": len(created_session_ids),
            "activities": len(created_activity_ids),
            "forms": len(created_form_ids),
            "session_ids": [str(value) for value in created_session_ids],
            "activity_ids": [str(value) for value in created_activity_ids],
            "form_ids": [str(value) for value in created_form_ids],
        },
        "post_injection_status_counts": status_counts,
        "overdue_job_result": {
            "processed": overdue_result.processed,
            "marked_overdue": overdue_result.marked_overdue,
        },
        "cleanup": cleanup_summary,
        "totals_for_seed_tag_in_tenant": totals_by_tag,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
    }

    artifact_path = Path(args.artifact)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(json.dumps(result_payload, indent=2), encoding="utf-8")

    print(
        "Injecao concluida:",
        f"pacientes={result_payload['patients']['resolved_in_tenant']}",
        f"sessoes={result_payload['created']['sessions']}",
        f"atividades={result_payload['created']['activities']}",
        f"formularios={result_payload['created']['forms']}",
        f"artifact={artifact_path}",
    )


if __name__ == "__main__":
    main()
