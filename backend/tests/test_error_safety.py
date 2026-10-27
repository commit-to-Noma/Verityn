"""Error-safety tests: unexpected failures stay fixed and silent.

Clients receive only the fixed JSON 500; application logs carry a
fixed line without exception text. Local tests still fail usefully
because pytest tracebacks are unaffected by server logging config.
"""

from app import create_app
from verityn import fake_coach


def test_debug_mode_is_off():
    app = create_app()
    assert app.debug is False
    assert app.config["DEBUG"] is False


def test_unexpected_exception_returns_fixed_500(caplog):
    app = create_app()

    @app.get("/api/_boom")
    def boom():
        raise RuntimeError("SECRET-MARKER-plain")

    res = app.test_client().get("/api/_boom")
    assert res.status_code == 500
    assert res.get_json()["error_code"] == "INTERNAL_ERROR"
    assert "SECRET-MARKER-plain" not in res.get_data(as_text=True)
    assert "SECRET-MARKER-plain" not in caplog.text
    assert "unhandled error; fixed response returned" in caplog.text


def test_unexpected_provider_error_stays_silent(caplog):
    class Broken:
        name = "broken"

        def r1_question(self, *, choice, why, facts=None):
            raise ValueError("key=SECRET-VALUE-MARKER")

    app = create_app(Broken(), fallback=fake_coach.FakeCoachProvider())
    client = app.test_client()
    recorded = client.post("/api/coach/predict", json={
        "challenge_id": "L1T1", "choice": "yes", "why": "x"}).get_json()
    res = client.post("/api/coach/ask", json={
        "session_id": recorded["session_id"],
        "netlist": {"components": [
            {"id": "B1", "type": "battery", "volts": 6,
             "a": "p", "b": "0"},
            {"id": "S1", "type": "switch", "closed": False,
             "a": "p", "b": "m"},
            {"id": "L1", "type": "bulb", "a": "m", "b": "n1"},
            {"id": "W9", "type": "wire", "a": "n1", "b": "0"},
        ]}})
    assert res.status_code == 500
    assert "SECRET-VALUE-MARKER" not in res.get_data(as_text=True)
    assert "SECRET-VALUE-MARKER" not in caplog.text
