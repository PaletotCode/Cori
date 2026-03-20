from collections.abc import Callable, Generator
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from alembic.config import Config
from app.core.config import settings
from app.core.security import hash_password
from app.main import app
from app.models import Patient, Psychologist, Tenant, User

TRUNCATE_SQL = (
    "TRUNCATE TABLE session_reminders, sessions, activities, clinical_forms, "
    "activity_templates, form_templates, assignment_idempotency_keys, "
    "notification_deliveries, notification_rules, "
    "dashboard_card_preferences, "
    "patient_profile_changes, "
    "timeline_events, patient_intakes, "
    "practice_profiles, auth_refresh_tokens, psychologists, patients, users, "
    "tenants CASCADE"
)


@dataclass(frozen=True)
class SeededTenant:
    tenant_id: UUID
    user_id: UUID
    psychologist_id: UUID
    patient_id: UUID
    email: str
    password: str


@pytest.fixture(scope="session")
def postgres_url() -> str:
    if not settings.database_url.startswith("postgresql"):
        pytest.skip("Testes de integracao exigem PostgreSQL.")
    return settings.database_url


@pytest.fixture(scope="session", autouse=True)
def migrated_schema(postgres_url: str) -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", postgres_url)
    command.downgrade(alembic_cfg, "base")
    command.upgrade(alembic_cfg, "head")


@pytest.fixture(scope="session")
def db_engine(postgres_url: str, migrated_schema: None):
    engine = create_engine(postgres_url, future=True)
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def session_factory(db_engine):
    return sessionmaker(
        bind=db_engine, autocommit=False, autoflush=False, expire_on_commit=False, class_=Session
    )


@pytest.fixture()
def db_session(session_factory) -> Generator[Session, None, None]:
    with session_factory() as cleanup_session:
        cleanup_session.execute(text("RESET ROLE"))
        cleanup_session.execute(text("SELECT set_config('app.current_tenant_id', '', false)"))
        cleanup_session.execute(text("SELECT set_config('app.rls_bypass', 'off', false)"))
        cleanup_session.execute(text(TRUNCATE_SQL))
        cleanup_session.commit()

    session = session_factory()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def seed_tenant(db_session: Session) -> Callable[..., SeededTenant]:
    def _seed(
        *,
        tenant_name: str,
        email: str,
        password: str,
        user_full_name: str,
        psychologist_display_name: str,
        patient_name: str,
    ) -> SeededTenant:
        db_session.execute(text("SET LOCAL ROLE cori_app"))
        tenant = Tenant(name=tenant_name)
        db_session.add(tenant)
        db_session.flush()

        db_session.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant.id)},
        )

        user = User(
            tenant_id=tenant.id,
            email=email.lower(),
            full_name=user_full_name,
            password_hash=hash_password(password),
        )
        db_session.add(user)
        db_session.flush()

        psychologist = Psychologist(
            tenant_id=tenant.id,
            user_id=user.id,
            display_name=psychologist_display_name,
        )
        db_session.add(psychologist)
        db_session.flush()

        patient = Patient(
            tenant_id=tenant.id,
            full_name=patient_name,
        )
        db_session.add(patient)
        db_session.flush()
        db_session.commit()

        return SeededTenant(
            tenant_id=tenant.id,
            user_id=user.id,
            psychologist_id=psychologist.id,
            patient_id=patient.id,
            email=user.email,
            password=password,
        )

    return _seed
