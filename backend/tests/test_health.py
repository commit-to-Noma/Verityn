"""Smoke tests for the Milestone 1 health endpoint."""

from app import create_app


def test_health_returns_ok():
    client = create_app().test_client()
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.is_json
    assert res.get_json() == {"status": "ok"}


def test_unknown_api_route_is_not_found():
    client = create_app().test_client()
    assert client.get("/api/does-not-exist").status_code == 404
