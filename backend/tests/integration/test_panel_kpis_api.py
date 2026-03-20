from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.services.panel_service import _shift_month

VALID_SESSION_STATUSES = {"scheduled", "confirmed", "rescheduled", "completed"}
PENDING_SESSION_STATUSES = {"scheduled", "rescheduled"}


def parse_dt(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def login_access_token(client, *, email: str, password: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def profile_payload(*, session_price_cents: int) -> dict[str, object]:
    return {
        "practice_name": "Clinica KPI",
        "clinical_approach": "TCC",
        "service_modality": "hybrid",
        "in_person_address": "Rua Principal, 100",
        "session_price_cents": session_price_cents,
        "currency": "BRL",
        "late_cancellation_window_hours": 24,
        "late_cancellation_fee_percent": 40,
        "no_show_fee_percent": 80,
        "notification_email_enabled": True,
        "notification_whatsapp_enabled": True,
        "notification_push_enabled": True,
        "session_reminder_hours_before": [24, 2],
        "default_triage_mode": "standard",
        "default_triage_message": None,
    }


def ensure_profile(client, *, access_token: str, session_price_cents: int) -> None:
    response = client.put(
        "/practice-profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json=profile_payload(session_price_cents=session_price_cents),
    )
    assert response.status_code == 200


def create_session(
    client,
    *,
    access_token: str,
    patient_id: str,
    start_at: datetime,
    end_at: datetime,
) -> dict[str, object]:
    response = client.post(
        "/sessions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "patient_id": patient_id,
            "scheduled_start_at": start_at.isoformat(),
            "scheduled_end_at": end_at.isoformat(),
            "location_mode": "online",
        },
    )
    assert response.status_code == 200
    return response.json()


def apply_session_action(
    client,
    *,
    access_token: str,
    session_id: str,
    action: str,
) -> None:
    response = client.post(
        f"/sessions/{session_id}/actions",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "action": action,
            **({"reason": "Cancelada para teste de KPI."} if action == "cancel" else {}),
        },
    )
    assert response.status_code == 200


def local_to_utc(target_day: date, *, hour: int, tz: ZoneInfo) -> datetime:
    return datetime.combine(target_day, time(hour, 0), tzinfo=tz).astimezone(UTC)


def test_panel_kpis_with_comparisons_and_business_rule(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Panel KPI",
        email="panel.kpi@cori.dev",
        password="panelkpi123",
        user_full_name="Dra. Panel KPI",
        psychologist_display_name="Dra. Panel KPI",
        patient_name="Paciente KPI",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)
    ensure_profile(client, access_token=token, session_price_cents=10_000)

    tz = ZoneInfo("America/Cuiaba")
    today_local = datetime.now(UTC).astimezone(tz).date()
    yesterday = today_local - timedelta(days=1)
    week_ago = today_local - timedelta(days=7)
    month_ago = _shift_month(today_local, months=-1)

    sessions: list[dict[str, object]] = []

    start = local_to_utc(today_local, hour=10, tz=tz)
    create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start,
        end_at=start + timedelta(minutes=50),
    )
    sessions.append({"start": start, "status": "scheduled"})

    start = local_to_utc(today_local, hour=14, tz=tz)
    created_confirmed = create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start,
        end_at=start + timedelta(minutes=50),
    )
    apply_session_action(
        client,
        access_token=token,
        session_id=created_confirmed["id"],
        action="confirm",
    )
    sessions.append({"start": start, "status": "confirmed"})

    start = local_to_utc(yesterday, hour=9, tz=tz)
    create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start,
        end_at=start + timedelta(minutes=50),
    )
    sessions.append({"start": start, "status": "scheduled"})

    start = local_to_utc(week_ago, hour=9, tz=tz)
    create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start,
        end_at=start + timedelta(minutes=50),
    )
    sessions.append({"start": start, "status": "scheduled"})

    start = local_to_utc(month_ago, hour=9, tz=tz)
    create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start,
        end_at=start + timedelta(minutes=50),
    )
    sessions.append({"start": start, "status": "scheduled"})

    start = local_to_utc(today_local, hour=16, tz=tz)
    created_canceled = create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=start,
        end_at=start + timedelta(minutes=50),
    )
    apply_session_action(
        client,
        access_token=token,
        session_id=created_canceled["id"],
        action="cancel",
    )
    sessions.append({"start": start, "status": "canceled"})

    response = client.get(
        "/panel/kpis?timezone=America/Cuiaba",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["calculation_version"] == "panel_kpi_v1"
    cards = {card["key"]: card for card in payload["cards"]}

    sessions_today = cards["sessions_today"]
    current_window_start = parse_dt(sessions_today["window_start_at"])
    current_window_end = parse_dt(sessions_today["window_end_at"])
    expected_sessions_today = sum(
        1
        for item in sessions
        if item["status"] in VALID_SESSION_STATUSES
        and current_window_start <= item["start"] < current_window_end
    )
    assert sessions_today["current_value"] == float(expected_sessions_today)
    assert len(sessions_today["comparisons"]) == 3

    pending_confirmation = cards["pending_confirmation"]
    expected_pending = sum(
        1
        for item in sessions
        if item["status"] in PENDING_SESSION_STATUSES
        and current_window_start <= item["start"] < current_window_end
    )
    assert pending_confirmation["current_value"] == float(expected_pending)

    weekly_revenue = cards["weekly_revenue_forecast"]
    week_window_start = parse_dt(weekly_revenue["window_start_at"])
    week_window_end = parse_dt(weekly_revenue["window_end_at"])
    expected_valid_sessions_week = sum(
        1
        for item in sessions
        if item["status"] in VALID_SESSION_STATUSES
        and week_window_start <= item["start"] < week_window_end
    )
    assert weekly_revenue["current_value"] == float(expected_valid_sessions_week * 10_000)
    assert weekly_revenue["metadata"]["missing_session_price"] is False
    assert (
        weekly_revenue["metadata"]["formula"]
        == "valid_sessions_in_week * current_session_price_cents"
    )


def test_panel_kpis_edge_cases_no_history_no_session_price(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Panel Edge",
        email="panel.edge@cori.dev",
        password="paneledge123",
        user_full_name="Dr. Panel Edge",
        psychologist_display_name="Dr. Panel Edge",
        patient_name="Paciente Edge",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)

    response = client.get(
        "/panel/kpis?timezone=UTC",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    cards = {card["key"]: card for card in response.json()["cards"]}

    assert cards["sessions_today"]["current_value"] == 0.0
    assert cards["pending_confirmation"]["current_value"] == 0.0
    assert cards["weekly_revenue_forecast"]["current_value"] is None
    assert cards["weekly_revenue_forecast"]["metadata"]["missing_session_price"] is True

    for card in cards.values():
        assert all(item["missing_baseline"] is True for item in card["comparisons"])


def test_panel_kpis_respect_timezone_cutoffs(client, seed_tenant) -> None:
    seeded = seed_tenant(
        tenant_name="Tenant Panel Timezone",
        email="panel.timezone@cori.dev",
        password="paneltz123",
        user_full_name="Dra. Timezone",
        psychologist_display_name="Dra. Timezone",
        patient_name="Paciente TZ",
    )
    token = login_access_token(client, email=seeded.email, password=seeded.password)
    ensure_profile(client, access_token=token, session_price_cents=5_000)

    utc_day = datetime.now(UTC).date()
    boundary_start = datetime.combine(utc_day, time(2, 0), tzinfo=UTC)
    create_session(
        client,
        access_token=token,
        patient_id=str(seeded.patient_id),
        start_at=boundary_start,
        end_at=boundary_start + timedelta(minutes=50),
    )

    response_utc = client.get(
        "/panel/kpis?timezone=UTC",
        headers={"Authorization": f"Bearer {token}"},
    )
    response_cuiaba = client.get(
        "/panel/kpis?timezone=America/Cuiaba",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response_utc.status_code == 200
    assert response_cuiaba.status_code == 200

    card_utc = next(
        card for card in response_utc.json()["cards"] if card["key"] == "sessions_today"
    )
    card_cuiaba = next(
        card for card in response_cuiaba.json()["cards"] if card["key"] == "sessions_today"
    )

    assert card_utc["window_start_at"] != card_cuiaba["window_start_at"]
    assert card_utc["window_end_at"] != card_cuiaba["window_end_at"]


def test_panel_preferences_get_put_patch_validation_and_isolation(client, seed_tenant) -> None:
    tenant_a = seed_tenant(
        tenant_name="Tenant Panel Pref A",
        email="panel.pref.a@cori.dev",
        password="panelprefa123",
        user_full_name="Dra. Pref A",
        psychologist_display_name="Dra. Pref A",
        patient_name="Paciente Pref A",
    )
    tenant_b = seed_tenant(
        tenant_name="Tenant Panel Pref B",
        email="panel.pref.b@cori.dev",
        password="panelprefb123",
        user_full_name="Dr. Pref B",
        psychologist_display_name="Dr. Pref B",
        patient_name="Paciente Pref B",
    )
    token_a = login_access_token(client, email=tenant_a.email, password=tenant_a.password)
    token_b = login_access_token(client, email=tenant_b.email, password=tenant_b.password)

    unauthenticated = client.get("/panel/preferences")
    assert unauthenticated.status_code == 401

    defaults = client.get(
        "/panel/preferences",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert defaults.status_code == 200
    cards = defaults.json()["cards"]
    assert len(cards) == 3
    assert all(card["order"] == ["yesterday", "weekAgo", "monthAgo"] for card in cards)

    put_response = client.put(
        "/panel/preferences/sessions_today",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "carousel_enabled": False,
            "display_mode": "fixed",
            "fixed_item": "weekAgo",
            "order": ["weekAgo", "yesterday", "monthAgo"],
        },
    )
    assert put_response.status_code == 200
    assert put_response.json()["fixed_item"] == "weekAgo"
    assert put_response.json()["display_mode"] == "fixed"

    patch_response = client.patch(
        "/panel/preferences/sessions_today",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"carousel_enabled": True},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["carousel_enabled"] is True

    invalid_order = client.patch(
        "/panel/preferences/sessions_today",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"order": ["yesterday", "yesterday", "monthAgo"]},
    )
    assert invalid_order.status_code == 422

    tenant_b_defaults = client.get(
        "/panel/preferences",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert tenant_b_defaults.status_code == 200
    sessions_today_b = next(
        card for card in tenant_b_defaults.json()["cards"] if card["card_key"] == "sessions_today"
    )
    assert sessions_today_b["display_mode"] == "dynamic"
    assert sessions_today_b["carousel_enabled"] is True
