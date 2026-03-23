from urllib.parse import parse_qs
from uuid import UUID
from sqlalchemy import func, select, text

from app.core.config import settings
from app.models import PatientIntake, PracticeProfile, Psychologist, Tenant, User
from app.services.auth_service import GoogleIdentity, auth_service


def test_login_refresh_logout_me_flow(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Alpha",
        email="alpha@cori.dev",
        password="alpha12345",
        user_full_name="Dra. Alpha",
        psychologist_display_name="Dra. Alpha",
        patient_name="Paciente Alpha",
    )

    login_response = client.post(
        "/auth/login",
        json={
            "email": seeded.email,
            "password": seeded.password,
        },
    )
    assert login_response.status_code == 200

    login_payload = login_response.json()
    assert login_payload["token_type"] == "bearer"
    assert login_payload["access_expires_in"] > 0
    assert login_payload["refresh_expires_in"] > 0

    access_token = login_payload["access_token"]
    refresh_token = login_payload["refresh_token"]

    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_response.status_code == 200

    me_payload = me_response.json()
    assert me_payload["tenant_id"] == str(seeded.tenant_id)
    assert me_payload["user_id"] == str(seeded.user_id)
    assert me_payload["psychologist_id"] == str(seeded.psychologist_id)
    assert me_payload["onboarding_completed"] is False

    refresh_response = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 200

    refreshed_payload = refresh_response.json()
    rotated_refresh_token = refreshed_payload["refresh_token"]

    logout_response = client.post("/auth/logout", json={"refresh_token": rotated_refresh_token})
    assert logout_response.status_code == 200
    assert logout_response.json() == {"success": True}

    replay_response = client.post("/auth/refresh", json={"refresh_token": rotated_refresh_token})
    assert replay_response.status_code == 401


def test_login_body_rejects_tenant_id(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Beta",
        email="beta@cori.dev",
        password="beta12345",
        user_full_name="Dr. Beta",
        psychologist_display_name="Dr. Beta",
        patient_name="Paciente Beta",
    )

    response = client.post(
        "/auth/login",
        json={
            "email": seeded.email,
            "password": seeded.password,
            "tenant_id": str(seeded.tenant_id),
        },
    )

    assert response.status_code == 422


def test_refresh_and_logout_body_reject_tenant_id(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Gamma",
        email="gamma@cori.dev",
        password="gamma12345",
        user_full_name="Dra. Gamma",
        psychologist_display_name="Dra. Gamma",
        patient_name="Paciente Gamma",
    )

    login_response = client.post(
        "/auth/login",
        json={
            "email": seeded.email,
            "password": seeded.password,
        },
    )
    assert login_response.status_code == 200
    refresh_token = login_response.json()["refresh_token"]

    refresh_response = client.post(
        "/auth/refresh",
        json={
            "refresh_token": refresh_token,
            "tenant_id": str(seeded.tenant_id),
        },
    )
    assert refresh_response.status_code == 422

    logout_response = client.post(
        "/auth/logout",
        json={
            "refresh_token": refresh_token,
            "tenant_id": str(seeded.tenant_id),
        },
    )
    assert logout_response.status_code == 422


def test_google_oauth_exchange_creates_tenant_and_user(
    client,
    db_session,
    session_factory,
    monkeypatch,
) -> None:
    _ = db_session
    monkeypatch.setattr(
        auth_service,
        "_resolve_google_identity",
        lambda **_: GoogleIdentity(
            subject="google-sub-01",
            email="dr.oauth@cori.dev",
            full_name="Dra. OAuth",
        ),
    )

    response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-1",
            "tenant_id": "tenant-fire-test",
            "redirect_uri": "cori://psicologo/login",
            "role": "psychologist",
            "state_nonce": "nonce-fire-001",
            "code_verifier": "a" * 43,
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["token_type"] == "bearer"

    me_response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {payload['access_token']}"},
    )
    assert me_response.status_code == 200
    me_payload = me_response.json()
    assert me_payload["email"] == "dr.oauth@cori.dev"

    with session_factory() as verification_session:
        verification_session.execute(text("SET LOCAL ROLE cori_app"))
        verification_session.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))

        tenant = verification_session.scalar(
            select(Tenant).where(Tenant.name == "tenant-fire-test")
        )
        assert tenant is not None
        verification_session.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant.id)},
        )

        user = verification_session.scalar(select(User).where(User.email == "dr.oauth@cori.dev"))
        assert user is not None
        assert user.tenant_id == tenant.id

        psychologist = verification_session.scalar(
            select(Psychologist).where(
                Psychologist.user_id == user.id,
                Psychologist.tenant_id == tenant.id,
            )
        )
        assert psychologist is not None
        assert me_payload["tenant_id"] == str(tenant.id)
        assert me_payload["user_id"] == str(user.id)
        assert me_payload["psychologist_id"] == str(psychologist.id)


def test_google_oauth_exchange_reuses_existing_tenant(
    client,
    db_session,
    session_factory,
    monkeypatch,
) -> None:
    _ = db_session
    monkeypatch.setattr(
        auth_service,
        "_resolve_google_identity",
        lambda **_: GoogleIdentity(
            subject="google-sub-02",
            email="dr.reuse@cori.dev",
            full_name="Dra. Reuse",
        ),
    )

    first_response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-first",
            "tenant_id": "tenant-reuse",
            "redirect_uri": "cori://psicologo/login",
            "role": "psychologist",
            "state_nonce": "nonce-reuse-001",
            "code_verifier": "a" * 43,
        },
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-second",
            "tenant_id": "tenant-reuse",
            "redirect_uri": "cori://psicologo/login",
            "role": "psychologist",
            "state_nonce": "nonce-reuse-002",
            "code_verifier": "a" * 43,
        },
    )
    assert second_response.status_code == 200

    first_me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {first_response.json()['access_token']}"},
    )
    second_me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {second_response.json()['access_token']}"},
    )
    assert first_me.status_code == 200
    assert second_me.status_code == 200
    assert first_me.json()["tenant_id"] == second_me.json()["tenant_id"]
    assert first_me.json()["user_id"] == second_me.json()["user_id"]

    with session_factory() as verification_session:
        verification_session.execute(text("SET LOCAL ROLE cori_app"))
        verification_session.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))
        verification_session.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": first_me.json()["tenant_id"]},
        )

        tenants_count = verification_session.scalar(select(func.count()).select_from(Tenant))
        users_count = verification_session.scalar(select(func.count()).select_from(User))
        psychologists_count = verification_session.scalar(
            select(func.count()).select_from(Psychologist)
        )

        assert tenants_count == 1
        assert users_count == 1
        assert psychologists_count == 1


def test_google_oauth_exchange_rejects_tenant_mismatch(client, db_session, monkeypatch) -> None:
    _ = db_session
    monkeypatch.setattr(
        auth_service,
        "_resolve_google_identity",
        lambda **_: GoogleIdentity(
            subject="google-sub-03",
            email="dr.conflict@cori.dev",
            full_name="Dra. Conflict",
        ),
    )

    first_response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-ok",
            "tenant_id": "tenant-primary",
            "redirect_uri": "cori://psicologo/login",
            "role": "psychologist",
            "state_nonce": "nonce-conflict-001",
            "code_verifier": "a" * 43,
        },
    )
    assert first_response.status_code == 200

    mismatch_response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-conflict",
            "tenant_id": "tenant-secondary",
            "redirect_uri": "cori://psicologo/login",
            "role": "psychologist",
            "state_nonce": "nonce-conflict-002",
            "code_verifier": "a" * 43,
        },
    )
    assert mismatch_response.status_code == 409
    assert "outro tenant" in mismatch_response.json()["detail"].lower()


def test_complete_onboarding_persists_profile_and_stops_repeating_flow(
    client,
    db_session,
    session_factory,
    monkeypatch,
) -> None:
    _ = db_session
    monkeypatch.setattr(
        auth_service,
        "_resolve_google_identity",
        lambda **_: GoogleIdentity(
            subject="google-sub-onboarding",
            email="dr.onboarding@cori.dev",
            full_name="Dra. Onboarding",
        ),
    )

    oauth_response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-onboarding",
            "tenant_id": "tenant-onboarding",
            "redirect_uri": "cori://psicologo/login",
            "role": "psychologist",
            "state_nonce": "nonce-onboarding-001",
            "code_verifier": "a" * 43,
        },
    )
    assert oauth_response.status_code == 200
    access_token = oauth_response.json()["access_token"]

    me_before = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_before.status_code == 200
    assert me_before.json()["onboarding_completed"] is False

    complete = client.post(
        "/auth/onboarding/complete",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "display_name": "Dra. Onboarding Prime",
            "clinical_approach": "TCC",
            "service_modality": "online",
        },
    )
    assert complete.status_code == 200
    complete_payload = complete.json()
    assert complete_payload["onboarding_completed"] is True
    assert complete_payload["full_name"] == "Dra. Onboarding Prime"

    me_after = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_after.status_code == 200
    assert me_after.json()["onboarding_completed"] is True

    with session_factory() as verification_session:
        verification_session.execute(text("SET LOCAL ROLE cori_app"))
        verification_session.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))

        tenant = verification_session.scalar(
            select(Tenant).where(Tenant.name == "tenant-onboarding")
        )
        assert tenant is not None
        verification_session.execute(
            text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
            {"tenant_id": str(tenant.id)},
        )
        profile = verification_session.scalar(
            select(PracticeProfile).where(PracticeProfile.tenant_id == tenant.id)
        )
        assert profile is not None
        assert profile.onboarding_completed is True
        assert profile.clinical_approach == "TCC"
        assert profile.service_modality == "online"


def test_google_exchange_uses_web_client_for_expo_proxy_redirect(monkeypatch) -> None:
    captured_payload: dict[str, list[str]] = {}

    def fake_perform_json_request(*args, **kwargs):
        request = args[0]
        raw_payload = request.data.decode("utf-8")
        captured_payload.update(parse_qs(raw_payload))
        return {"access_token": "oauth-access-token"}

    monkeypatch.setattr(auth_service, "_perform_json_request", fake_perform_json_request)
    monkeypatch.setattr(settings, "google_oauth_client_id", "web-client-id")
    monkeypatch.setattr(settings, "google_oauth_ios_client_id", "ios-client-id")
    monkeypatch.setattr(settings, "google_oauth_client_secret", "web-client-secret")

    payload = auth_service._exchange_google_code_for_tokens(
        code="oauth-code",
        redirect_uri="https://auth.expo.io/@paletot/cori-v2",
        code_verifier="b" * 43,
    )

    assert payload["access_token"] == "oauth-access-token"
    assert captured_payload["client_id"] == ["web-client-id"]
    assert captured_payload["client_secret"] == ["web-client-secret"]
    assert captured_payload["redirect_uri"] == ["https://auth.expo.io/@paletot/cori-v2"]


def test_google_exchange_uses_ios_client_without_secret_for_native_redirect(monkeypatch) -> None:
    captured_payload: dict[str, list[str]] = {}

    def fake_perform_json_request(*args, **kwargs):
        request = args[0]
        raw_payload = request.data.decode("utf-8")
        captured_payload.update(parse_qs(raw_payload))
        return {"access_token": "oauth-access-token"}

    monkeypatch.setattr(auth_service, "_perform_json_request", fake_perform_json_request)
    monkeypatch.setattr(settings, "google_oauth_client_id", "web-client-id")
    monkeypatch.setattr(settings, "google_oauth_ios_client_id", "ios-client-id")
    monkeypatch.setattr(settings, "google_oauth_client_secret", "web-client-secret")

    payload = auth_service._exchange_google_code_for_tokens(
        code="oauth-code",
        redirect_uri="cori://psicologo/login",
        code_verifier="c" * 43,
    )

    assert payload["access_token"] == "oauth-access-token"
    assert captured_payload["client_id"] == ["ios-client-id"]
    assert "client_secret" not in captured_payload
    assert captured_payload["redirect_uri"] == ["cori://psicologo/login"]


def test_patient_google_oauth_exchange_requires_access_code(client, monkeypatch) -> None:
    monkeypatch.setattr(
        auth_service,
        "_resolve_google_identity",
        lambda **_: GoogleIdentity(
            subject="google-sub-patient-required",
            email="paciente.required@cori.dev",
            full_name="Paciente Required",
        ),
    )

    response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-patient-required",
            "tenant_id": "tenant-placeholder",
            "redirect_uri": "cori://psicologo/login",
            "role": "patient",
            "state_nonce": "nonce-patient-required-1",
            "code_verifier": "a" * 43,
        },
    )
    assert response.status_code == 422
    assert "codigo de acesso" in response.json()["detail"].lower()


def test_patient_google_oauth_exchange_binds_intake_and_blocks_admin_routes(
    client,
    seed_tenant,
    session_factory,
    monkeypatch,
) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Patient OAuth",
        email="dr.patient.oauth@cori.dev",
        password="patientoauth123",
        user_full_name="Dra. Patient OAuth",
        psychologist_display_name="Dra. Patient OAuth",
        patient_name="Paciente Base",
    )

    login_response = client.post(
        "/auth/login",
        json={"email": seeded.email, "password": seeded.password},
    )
    assert login_response.status_code == 200
    psychologist_token = login_response.json()["access_token"]

    invite_response = client.post(
        "/intakes/invites",
        headers={"Authorization": f"Bearer {psychologist_token}"},
        json={
            "mode": "simple_invite",
            "expires_in_hours": 72,
            "access_code_alias": "Paciente",
        },
    )
    assert invite_response.status_code == 200
    invite_payload = invite_response.json()

    monkeypatch.setattr(
        auth_service,
        "_resolve_google_identity",
        lambda **_: GoogleIdentity(
            subject="google-sub-patient-ok",
            email="paciente.oauth@cori.dev",
            full_name="Paciente OAuth",
        ),
    )

    oauth_response = client.post(
        "/auth/google/exchange",
        json={
            "code": "google-auth-code-patient-ok",
            "tenant_id": "tenant-placeholder",
            "redirect_uri": "cori://psicologo/login",
            "role": "patient",
            "state_nonce": "nonce-patient-ok-1",
            "code_verifier": "a" * 43,
            "intake_access_code": invite_payload["access_code"],
        },
    )
    assert oauth_response.status_code == 200
    patient_token = oauth_response.json()["access_token"]

    psychologist_patient_intake_response = client.get(
        "/intakes/patient/me",
        headers={"Authorization": f"Bearer {psychologist_token}"},
    )
    assert psychologist_patient_intake_response.status_code == 403

    patient_intake_response = client.get(
        "/intakes/patient/me",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert patient_intake_response.status_code == 200
    assert patient_intake_response.json()["status"] == "pending_submission"

    patient_submit_response = client.post(
        "/intakes/patient/me/submit",
        headers={"Authorization": f"Bearer {patient_token}"},
        json={
            "patient_full_name": "Paciente OAuth",
            "patient_preferred_name": "Paciente O.",
            "patient_email": "paciente.oauth@cori.dev",
            "patient_phone": "+55 65 99999-3311",
            "patient_birth_date": "1995-10-21",
            "patient_pronouns": "ela/dela",
            "patient_emergency_contact_name": "Contato OAuth",
            "patient_emergency_contact_phone": "+55 65 99999-4411",
            "patient_communication_notes": "Prefere contato por texto.",
            "patient_profile_photo_url": "https://cdn.cori.dev/patient-oauth-photo.jpg",
            "patient_profile_banner_url": "https://cdn.cori.dev/patient-oauth-banner.jpg",
            "consent_terms_accepted": True,
            "consent_privacy_accepted": True,
        },
    )
    assert patient_submit_response.status_code == 200
    assert patient_submit_response.json()["status"] == "submitted"

    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {patient_token}"})
    assert me_response.status_code == 403

    queue_response = client.get(
        "/intakes/queue",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert queue_response.status_code == 403

    with session_factory() as verification_session:
        verification_session.execute(text("SET LOCAL ROLE cori_app"))
        verification_session.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))

        intake = verification_session.scalar(
            select(PatientIntake).where(PatientIntake.id == UUID(invite_payload["intake_id"]))
        )
        assert intake is not None
        assert intake.patient_auth_user_id is not None
        assert intake.patient_oauth_email == "paciente.oauth@cori.dev"
        assert intake.patient_oauth_google_subject == "google-sub-patient-ok"
        assert intake.patient_oauth_authenticated_at is not None
        assert intake.patient_pronouns == "ela/dela"
