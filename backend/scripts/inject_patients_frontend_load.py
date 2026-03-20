from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Literal
from uuid import UUID

from sqlalchemy import select, text

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Patient, Tenant, User
from app.schemas.patient import PatientCreateRequest, PatientUpdateRequest
from app.services.patient_service import PatientServiceError, patient_service

ContactChannel = Literal["whatsapp", "email", "phone"]


@dataclass(frozen=True)
class PatientTemplate:
    slug: str
    preferred_contact_channel: ContactChannel
    with_email: bool
    with_phone: bool
    whatsapp_like_phone: bool
    with_birth_date: bool
    with_emergency_contact: bool
    with_pronouns: bool
    with_preferred_name: bool
    long_note: bool
    intentionally_mismatched_contact: bool


TEMPLATES: list[PatientTemplate] = [
    PatientTemplate(
        slug="whatsapp_complete",
        preferred_contact_channel="whatsapp",
        with_email=True,
        with_phone=True,
        whatsapp_like_phone=True,
        with_birth_date=True,
        with_emergency_contact=True,
        with_pronouns=True,
        with_preferred_name=True,
        long_note=False,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="email_primary",
        preferred_contact_channel="email",
        with_email=True,
        with_phone=False,
        whatsapp_like_phone=False,
        with_birth_date=True,
        with_emergency_contact=False,
        with_pronouns=True,
        with_preferred_name=True,
        long_note=False,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="phone_short_non_whatsapp",
        preferred_contact_channel="phone",
        with_email=False,
        with_phone=True,
        whatsapp_like_phone=False,
        with_birth_date=False,
        with_emergency_contact=False,
        with_pronouns=False,
        with_preferred_name=False,
        long_note=False,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="minimal_no_contact",
        preferred_contact_channel="whatsapp",
        with_email=False,
        with_phone=False,
        whatsapp_like_phone=False,
        with_birth_date=False,
        with_emergency_contact=False,
        with_pronouns=False,
        with_preferred_name=False,
        long_note=False,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="night_shift",
        preferred_contact_channel="phone",
        with_email=True,
        with_phone=True,
        whatsapp_like_phone=True,
        with_birth_date=True,
        with_emergency_contact=True,
        with_pronouns=True,
        with_preferred_name=False,
        long_note=False,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="flexible_intake_like",
        preferred_contact_channel="whatsapp",
        with_email=True,
        with_phone=True,
        whatsapp_like_phone=True,
        with_birth_date=True,
        with_emergency_contact=False,
        with_pronouns=False,
        with_preferred_name=True,
        long_note=True,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="emergency_heavy",
        preferred_contact_channel="phone",
        with_email=True,
        with_phone=True,
        whatsapp_like_phone=True,
        with_birth_date=True,
        with_emergency_contact=True,
        with_pronouns=True,
        with_preferred_name=True,
        long_note=True,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="email_channel_missing_email",
        preferred_contact_channel="email",
        with_email=False,
        with_phone=True,
        whatsapp_like_phone=True,
        with_birth_date=True,
        with_emergency_contact=False,
        with_pronouns=False,
        with_preferred_name=False,
        long_note=False,
        intentionally_mismatched_contact=True,
    ),
    PatientTemplate(
        slug="whatsapp_with_invalid_len",
        preferred_contact_channel="whatsapp",
        with_email=True,
        with_phone=True,
        whatsapp_like_phone=False,
        with_birth_date=False,
        with_emergency_contact=False,
        with_pronouns=True,
        with_preferred_name=True,
        long_note=False,
        intentionally_mismatched_contact=False,
    ),
    PatientTemplate(
        slug="full_profile_long_note",
        preferred_contact_channel="whatsapp",
        with_email=True,
        with_phone=True,
        whatsapp_like_phone=True,
        with_birth_date=True,
        with_emergency_contact=True,
        with_pronouns=True,
        with_preferred_name=True,
        long_note=True,
        intentionally_mismatched_contact=False,
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Injeta pacientes com cenarios variados para estressar listas, filtros e cards no frontend."
        )
    )
    parser.add_argument("--count", type=int, default=30, help="Quantidade de pacientes a injetar.")
    parser.add_argument(
        "--tenant-name",
        type=str,
        default=None,
        help="Nome do tenant alvo. Se omitido, usa o tenant do usuario alvo ou o primeiro disponivel.",
    )
    parser.add_argument(
        "--user-email",
        type=str,
        default=None,
        help="Email do usuario psicologo que sera usado como ator da injecao.",
    )
    parser.add_argument(
        "--artifact",
        type=str,
        default="artifacts/seed/patients_frontend_injection_summary.json",
        help="Arquivo JSON de resumo da execucao.",
    )
    parser.add_argument(
        "--demo-tenant",
        type=str,
        default="Clinica Carga Frontend",
        help="Tenant criado automaticamente caso nao exista base inicial.",
    )
    parser.add_argument(
        "--demo-user-email",
        type=str,
        default="stress.psicologo@cori.dev",
        help="Email do usuario demo criado automaticamente, se necessario.",
    )
    parser.add_argument(
        "--demo-user-name",
        type=str,
        default="Dr Stress Frontend",
        help="Nome do usuario demo criado automaticamente, se necessario.",
    )
    parser.add_argument(
        "--demo-password",
        type=str,
        default="dev123456",
        help="Senha do usuario demo criado automaticamente.",
    )
    return parser.parse_args()


def make_phone(index: int, *, whatsapp_like: bool) -> str:
    if whatsapp_like:
        return f"+5565991{index:04d}"
    # 8 digitos apos o DDI para simular telefone valido, mas nao WhatsApp-valid no app.
    return f"+5565{(index + 234567):06d}"


def maybe_birth_date(index: int, enabled: bool) -> date | None:
    if not enabled:
        return None
    year = 1978 + (index % 28)
    month = (index % 12) + 1
    day = (index % 27) + 1
    return date(year, month, day)


def build_payload(index: int, template: PatientTemplate) -> PatientCreateRequest:
    full_name = f"Carga Frontend Paciente {index + 1:02d} {template.slug}"
    preferred_name = (
        f"Paciente {index + 1:02d}" if template.with_preferred_name else None
    )

    email = f"carga.frontend.{index + 1:02d}@cori.dev" if template.with_email else None
    phone = make_phone(index=index, whatsapp_like=template.whatsapp_like_phone) if template.with_phone else None

    if template.intentionally_mismatched_contact:
        email = None

    pronoun_options = ["ela/dela", "ele/dele", "elu/delu"]
    pronouns = pronoun_options[index % len(pronoun_options)] if template.with_pronouns else None

    emergency_name = f"Contato Emergencia {index + 1:02d}" if template.with_emergency_contact else None
    emergency_phone = (
        make_phone(index=index + 90, whatsapp_like=True) if template.with_emergency_contact else None
    )

    note = (
        "Paciente em acompanhamento com observacao clinica extensa para validar truncamento, "
        "quebra de linha e renderizacao de listas longas no frontend."
        if template.long_note
        else f"Cenario {template.slug} para validacao de UX e filtros ({index + 1:02d})."
    )

    return PatientCreateRequest(
        full_name=full_name,
        preferred_name=preferred_name,
        email=email,
        phone=phone,
        birth_date=maybe_birth_date(index=index, enabled=template.with_birth_date),
        pronouns=pronouns,
        emergency_contact_name=emergency_name,
        emergency_contact_phone=emergency_phone,
        preferred_contact_channel=template.preferred_contact_channel,
        communication_notes=note,
    )


def should_archive(index: int) -> bool:
    # Para 30 pacientes => indices 9, 19, 29 arquivados.
    return (index + 1) % 10 == 0


def ensure_target_context(
    *,
    db,
    tenant_name: str | None,
    user_email: str | None,
    demo_tenant: str,
    demo_user_email: str,
    demo_user_name: str,
    demo_password: str,
) -> tuple[Tenant, User, bool]:
    created_demo_user = False
    normalized_user_email = user_email.strip().lower() if user_email else None

    tenant: Tenant | None = None
    user: User | None = None

    if normalized_user_email is not None:
        user = db.scalar(
            select(User).where(
                User.email == normalized_user_email,
                User.is_active.is_(True),
            )
        )
        if user is None:
            raise RuntimeError(f"Usuario '{normalized_user_email}' nao encontrado ou inativo.")
        tenant = db.scalar(select(Tenant).where(Tenant.id == user.tenant_id))
        if tenant is None:
            raise RuntimeError("Tenant do usuario informado nao encontrado.")

    if tenant is None and tenant_name is not None:
        tenant = db.scalar(select(Tenant).where(Tenant.name == tenant_name))

    if tenant is not None and user is None:
        user = db.scalar(
            select(User)
            .where(User.tenant_id == tenant.id, User.is_active.is_(True))
            .order_by(User.created_at.asc())
        )

    if tenant is None and user is None:
        user = db.scalar(
            select(User).where(User.is_active.is_(True)).order_by(User.created_at.asc())
        )
        if user is not None:
            tenant = db.scalar(select(Tenant).where(Tenant.id == user.tenant_id))

    if tenant is None:
        tenant = Tenant(name=demo_tenant)
        db.add(tenant)
        db.flush()

    db.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant.id)},
    )

    if user is None:
        demo_email = demo_user_email.strip().lower()
        user = db.scalar(select(User).where(User.email == demo_email))
        if user is None:
            user = User(
                tenant_id=tenant.id,
                email=demo_email,
                full_name=demo_user_name,
                password_hash=hash_password(demo_password),
                is_active=True,
            )
            db.add(user)
            db.flush()
            created_demo_user = True
        elif user.tenant_id != tenant.id:
            raise RuntimeError(
                "Usuario demo ja existe em outro tenant. Informe --user-email de um usuario valido."
            )

    return tenant, user, created_demo_user


def run_injection(args: argparse.Namespace) -> dict[str, object]:
    if args.count <= 0:
        raise ValueError("--count deve ser maior que zero.")

    summary: dict[str, object] = {
        "requested_count": args.count,
        "created": 0,
        "updated": 0,
        "overwritten_updates": 0,
        "archived": 0,
        "reactivated": 0,
        "intake_marked": 0,
        "tenant_id": None,
        "tenant_name": None,
        "actor_user_id": None,
        "actor_user_email": None,
        "created_demo_user": False,
        "patient_ids": [],
        "archived_patient_ids": [],
        "executed_at": datetime.now(UTC).isoformat(),
    }

    with SessionLocal() as db:
        db.execute(text("SET LOCAL ROLE cori_app"))
        db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))

        tenant, actor_user, created_demo_user = ensure_target_context(
            db=db,
            tenant_name=args.tenant_name,
            user_email=args.user_email,
            demo_tenant=args.demo_tenant,
            demo_user_email=args.demo_user_email,
            demo_user_name=args.demo_user_name,
            demo_password=args.demo_password,
        )

        db.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant.id)},
        )

        summary["tenant_id"] = str(tenant.id)
        summary["tenant_name"] = tenant.name
        summary["actor_user_id"] = str(actor_user.id)
        summary["actor_user_email"] = actor_user.email
        summary["created_demo_user"] = created_demo_user

        now = datetime.now(UTC)
        active_patient_ids: list[str] = []
        archived_patient_ids: list[str] = []

        for index in range(args.count):
            template = TEMPLATES[index % len(TEMPLATES)]
            payload = build_payload(index=index, template=template)

            patient = db.scalar(
                select(Patient).where(
                    Patient.tenant_id == tenant.id,
                    Patient.full_name == payload.full_name,
                )
            )

            if patient is None:
                patient = patient_service.create_patient(
                    db,
                    tenant_id=tenant.id,
                    actor_user_id=actor_user.id,
                    payload=payload,
                )
                summary["created"] = int(summary["created"]) + 1
            else:
                if patient.archived_at is not None and not should_archive(index):
                    patient.archived_at = None
                    patient.archived_by_user_id = None
                    summary["reactivated"] = int(summary["reactivated"]) + 1

                update_payload = PatientUpdateRequest(
                    **payload.model_dump(),
                    overwrite_initial_registration=False,
                )
                try:
                    patient = patient_service.update_patient(
                        db,
                        tenant_id=tenant.id,
                        actor_user_id=actor_user.id,
                        patient_id=patient.id,
                        payload=update_payload,
                    )
                except PatientServiceError as exc:
                    raise RuntimeError(
                        f"Falha ao atualizar paciente '{payload.full_name}': {exc.detail}"
                    ) from exc
                summary["updated"] = int(summary["updated"]) + 1

            if index % 3 == 0:
                churn_data = payload.model_dump()
                churn_data["communication_notes"] = (
                    f"{payload.communication_notes} | Atualizacao de carga {index + 1:02d}."
                )[:500]
                churn_payload = PatientUpdateRequest(
                    **churn_data,
                    overwrite_initial_registration=False,
                )
                patient = patient_service.update_patient(
                    db,
                    tenant_id=tenant.id,
                    actor_user_id=actor_user.id,
                    patient_id=patient.id,
                    payload=churn_payload,
                )
                summary["updated"] = int(summary["updated"]) + 1

            if index % 8 == 0:
                overwrite_payload = PatientUpdateRequest(
                    **payload.model_dump(),
                    overwrite_initial_registration=True,
                    overwrite_reason=f"Reconciliacao de cadastro simulada para carga {index + 1:02d}.",
                )
                patient = patient_service.update_patient(
                    db,
                    tenant_id=tenant.id,
                    actor_user_id=actor_user.id,
                    patient_id=patient.id,
                    payload=overwrite_payload,
                )
                summary["overwritten_updates"] = int(summary["overwritten_updates"]) + 1

            if index % 5 == 0 and patient.profile_source != "intake":
                patient.profile_source = "intake"
                summary["intake_marked"] = int(summary["intake_marked"]) + 1

            backdated_updated_at = now - timedelta(days=index % 21, hours=(index * 2) % 24)
            backdated_created_at = backdated_updated_at - timedelta(days=(index % 4) + 1)
            patient.updated_at = backdated_updated_at
            if patient.created_at > backdated_created_at:
                patient.created_at = backdated_created_at

            if should_archive(index):
                if patient.archived_at is None:
                    patient = patient_service.archive_patient(
                        db,
                        tenant_id=tenant.id,
                        actor_user_id=actor_user.id,
                        patient_id=patient.id,
                    )
                    summary["archived"] = int(summary["archived"]) + 1
                archived_patient_ids.append(str(patient.id))
            else:
                active_patient_ids.append(str(patient.id))

        db.commit()

        summary["patient_ids"] = active_patient_ids
        summary["archived_patient_ids"] = archived_patient_ids

    return summary


def persist_summary(summary: dict[str, object], artifact_path: str) -> Path:
    path = Path(artifact_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    return path


def main() -> None:
    args = parse_args()
    summary = run_injection(args)
    artifact = persist_summary(summary, args.artifact)

    print("Injecao de pacientes finalizada.")
    print(f"Tenant: {summary['tenant_name']} ({summary['tenant_id']})")
    print(f"Ator: {summary['actor_user_email']} ({summary['actor_user_id']})")
    print(
        "Criados={created} Atualizados={updated} Overwrite={overwritten_updates} "
        "Arquivados={archived} Intake={intake_marked} Reativados={reactivated}".format(
            created=summary["created"],
            updated=summary["updated"],
            overwritten_updates=summary["overwritten_updates"],
            archived=summary["archived"],
            intake_marked=summary["intake_marked"],
            reactivated=summary["reactivated"],
        )
    )
    print(f"Pacientes ativos no lote: {len(summary['patient_ids'])}")
    print(f"Pacientes arquivados no lote: {len(summary['archived_patient_ids'])}")
    print(f"Resumo salvo em: {artifact}")
    if summary.get("created_demo_user"):
        print(
            "Usuario demo criado automaticamente. "
            "Use --user-email para fixar um ator especifico em execucoes futuras."
        )


if __name__ == "__main__":
    main()
