from dataclasses import dataclass

from sqlalchemy import select, text

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Patient, Psychologist, Tenant, User


@dataclass(frozen=True)
class SeedSpec:
    tenant_name: str
    user_email: str
    user_full_name: str
    psychologist_display_name: str
    patient_name: str


DEFAULT_PASSWORD = "dev123456"
SEED_SPECS = [
    SeedSpec(
        tenant_name="Clinica Aurora",
        user_email="dr.aurora@cori.dev",
        user_full_name="Dra. Aurora",
        psychologist_display_name="Dra. Aurora",
        patient_name="Paciente Aurora",
    ),
    SeedSpec(
        tenant_name="Clinica Boreal",
        user_email="dr.boreal@cori.dev",
        user_full_name="Dr. Boreal",
        psychologist_display_name="Dr. Boreal",
        patient_name="Paciente Boreal",
    ),
]


def seed_data() -> None:
    with SessionLocal() as db:
        db.execute(text("SET LOCAL ROLE cori_app"))
        db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))

        for spec in SEED_SPECS:
            tenant = db.scalar(select(Tenant).where(Tenant.name == spec.tenant_name))
            if tenant is None:
                tenant = Tenant(name=spec.tenant_name)
                db.add(tenant)
                db.flush()

            db.execute(
                text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
                {"tenant_id": str(tenant.id)},
            )

            user = db.scalar(select(User).where(User.email == spec.user_email))
            if user is None:
                user = User(
                    tenant_id=tenant.id,
                    email=spec.user_email,
                    full_name=spec.user_full_name,
                    password_hash=hash_password(DEFAULT_PASSWORD),
                )
                db.add(user)
                db.flush()

            psychologist = db.scalar(select(Psychologist).where(Psychologist.user_id == user.id))
            if psychologist is None:
                db.add(
                    Psychologist(
                        tenant_id=tenant.id,
                        user_id=user.id,
                        display_name=spec.psychologist_display_name,
                    )
                )

            patient = db.scalar(
                select(Patient).where(
                    Patient.tenant_id == tenant.id, Patient.full_name == spec.patient_name
                )
            )
            if patient is None:
                db.add(
                    Patient(
                        tenant_id=tenant.id,
                        full_name=spec.patient_name,
                    )
                )

        db.commit()


if __name__ == "__main__":
    seed_data()
    print("Seed de desenvolvimento aplicado com sucesso.")
    print("Usuarios: dr.aurora@cori.dev / dr.boreal@cori.dev")
    print(f"Senha padrao: {DEFAULT_PASSWORD}")
