from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthcheck_ok(monkeypatch) -> None:
    monkeypatch.setattr("app.api.routes_health.check_database", lambda: True)
    monkeypatch.setattr("app.api.routes_health.check_redis", lambda: True)

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["dependencies"] == {"database": "ok", "redis": "ok"}


def test_healthcheck_degraded(monkeypatch) -> None:
    monkeypatch.setattr("app.api.routes_health.check_database", lambda: False)
    monkeypatch.setattr("app.api.routes_health.check_redis", lambda: True)

    response = client.get("/health")

    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["dependencies"]["database"] == "down"
