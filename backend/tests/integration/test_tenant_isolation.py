from sqlalchemy import select, text

from app.models import Patient


def test_rls_isolates_patients_between_tenants(seed_tenant, session_factory) -> None:
    tenant_a = seed_tenant(
        tenant_name="Tenant A",
        email="a@cori.dev",
        password="tenantA123",
        user_full_name="Dr. A",
        psychologist_display_name="Dr. A",
        patient_name="Paciente A",
    )
    tenant_b = seed_tenant(
        tenant_name="Tenant B",
        email="b@cori.dev",
        password="tenantB123",
        user_full_name="Dr. B",
        psychologist_display_name="Dr. B",
        patient_name="Paciente B",
    )

    with session_factory() as tenant_a_session:
        tenant_a_session.execute(text("SET LOCAL ROLE cori_app"))
        tenant_a_session.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant_a.tenant_id)},
        )
        visible_a = {patient.id for patient in tenant_a_session.scalars(select(Patient)).all()}
        blocked_b = tenant_a_session.scalar(
            select(Patient).where(Patient.id == tenant_b.patient_id)
        )

    assert visible_a == {tenant_a.patient_id}
    assert blocked_b is None

    with session_factory() as tenant_b_session:
        tenant_b_session.execute(text("SET LOCAL ROLE cori_app"))
        tenant_b_session.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant_b.tenant_id)},
        )
        visible_b = {patient.id for patient in tenant_b_session.scalars(select(Patient)).all()}

    assert visible_b == {tenant_b.patient_id}


def test_rls_blocks_queries_without_tenant_context(seed_tenant, session_factory) -> None:
    seed_tenant(
        tenant_name="Tenant C",
        email="c@cori.dev",
        password="tenantC123",
        user_full_name="Dr. C",
        psychologist_display_name="Dr. C",
        patient_name="Paciente C",
    )

    with session_factory() as no_tenant_session:
        no_tenant_session.execute(text("SET LOCAL ROLE cori_app"))
        visible = no_tenant_session.scalars(select(Patient)).all()

    assert visible == []
