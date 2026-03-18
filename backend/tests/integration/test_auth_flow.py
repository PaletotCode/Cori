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
