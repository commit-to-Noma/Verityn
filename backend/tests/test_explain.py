"""Experiment explanations: solver-first facts, provider fallback, grounding.

POST /api/coach/explain takes a netlist, solves it server-side, and
explains the measurements (or the rejection). No session, no rung, no
verdict. The HTTP transport is always mocked; no test spends credits.
"""

import json

import pytest

from app import create_app
from verityn import coach, fake_coach, meta_coach

LIT_LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "S1", "type": "switch", "closed": True, "a": "p", "b": "m"},
    {"id": "L1", "type": "bulb", "a": "m", "b": "0"},
]}

DARK_LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "S1", "type": "switch", "closed": False, "a": "p", "b": "m"},
    {"id": "L1", "type": "bulb", "a": "m", "b": "0"},
]}

SHORTED = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "W1", "type": "wire", "a": "p", "b": "0"},
]}

OVERLOAD_LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "m"},
    {"id": "B2", "type": "battery", "volts": 6, "a": "m", "b": "0"},
    {"id": "L1", "type": "bulb", "a": "p", "b": "0"},
]}

DAMAGED_LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "L1", "type": "bulb", "condition": "damaged", "a": "p", "b": "0"},
]}


def chat_response(obj):
    return {"choices": [{"message": {"content": json.dumps(obj)}}]}


@pytest.fixture()
def client():
    return create_app().test_client()


def test_explain_lit_loop_uses_solver_numbers(client):
    res = client.post("/api/coach/explain", json={"netlist": LIT_LOOP})
    assert res.status_code == 200
    body = res.get_json()
    assert body["eligible"] is True
    assert body["valid"] is True
    assert body["error_code"] is None
    assert body["provider"] == "prototype-fake"
    assert "L1 lit: 0.6 A and 3.6 W" in body["text"]
    assert "S1" in body["text"]


def test_explain_dark_loop_reports_zero_reading(client):
    res = client.post("/api/coach/explain", json={"netlist": DARK_LOOP})
    body = res.get_json()
    assert body["valid"] is True
    assert "no bulb lit" in body["text"]
    assert "0.0 A and 0.0 W" in body["text"]


def test_explain_rejected_circuit_names_no_measurements(client):
    res = client.post("/api/coach/explain", json={"netlist": SHORTED})
    body = res.get_json()
    assert res.status_code == 200
    assert body["eligible"] is True
    assert body["valid"] is False
    assert body["error_code"] == "SHORTED_BATTERY"
    assert "straight back to itself" in body["text"]
    assert "0.6" not in body["text"]


def test_explain_empty_circuit_is_explainable(client):
    res = client.post("/api/coach/explain",
                      json={"netlist": {"components": []}})
    body = res.get_json()
    assert body["valid"] is False
    assert body["error_code"] == "EMPTY_CIRCUIT"


@pytest.mark.parametrize("body", [
    {},
    {"netlist": None},
    {"netlist": []},
    {"netlist": "B1-L1"},
])
def test_explain_malformed_body_is_400(client, body):
    res = client.post("/api/coach/explain", json=body)
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"


def test_explain_malformed_netlist_judged_by_solver(client):
    res = client.post("/api/coach/explain",
                      json={"netlist": {"components": [{"id": 7}]}})
    body = res.get_json()
    assert res.status_code == 200
    assert body["valid"] is False
    assert body["error_code"] == "MALFORMED_NETLIST"


def test_explain_primary_failure_falls_back_with_label():
    app = create_app(fake_coach.FakeCoachProvider(fail=True),
                     fallback=fake_coach.FakeCoachProvider())
    res = app.test_client().post("/api/coach/explain",
                                 json={"netlist": LIT_LOOP})
    assert res.status_code == 200
    assert res.get_json()["provider"] == "prototype-fake"


def test_explain_total_failure_is_safe_500():
    app = create_app(fake_coach.FakeCoachProvider(fail=True))
    res = app.test_client().post("/api/coach/explain",
                                 json={"netlist": LIT_LOOP})
    assert res.status_code == 500
    assert res.get_json()["error_code"] == "INTERNAL_ERROR"


def test_explain_solves_server_side_not_client_facts():
    seen = {}

    class SpyProvider:
        name = "spy"

        def explain(self, **call):
            seen.update(call)
            return "seen"

    out = coach.explain_result(DARK_LOOP, SpyProvider())
    assert out["provider"] == "spy"
    assert seen["valid"] is True
    assert seen["facts"]["L1.power_W"] == 0.0
    assert seen["switches"] == {"S1": False}
    assert seen["bulbs"] == ["L1"]


def test_explain_rejected_passes_empty_facts():
    seen = {}

    class SpyProvider:
        name = "spy"

        def explain(self, **call):
            seen.update(call)
            return "seen"

    out = coach.explain_result(SHORTED, SpyProvider())
    assert out["valid"] is False
    assert out["error_code"] == "SHORTED_BATTERY"
    assert seen["facts"] == {}


def test_meta_explain_accepts_grounded_output(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    text = "L1 lit: 0.6 A and 3.6 W. Current has a complete path."
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *a: (200, chat_response({"explanation": text})))
    facts = {"L1.power_W": 3.6, "L1.current_A": 0.6,
             "L1.voltage_V": 6.0}
    assert provider.explain(facts=facts, valid=True, error_code=None,
                            component_ids=[], switches={"S1": True},
                            bulbs=["L1"]) == text


def test_meta_explain_rejects_invented_numbers(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    monkeypatch.setattr(
        meta_coach, "_post_json",
        lambda *a: (200, chat_response({"explanation": "L1 reads 9.9 A."})))
    with pytest.raises(coach.CoachProviderError) as err:
        provider.explain(facts={"L1.power_W": 0.0, "L1.current_A": 0.0,
                                "L1.voltage_V": 6.0},
                         valid=True, error_code=None, component_ids=[],
                         switches={}, bulbs=["L1"])
    assert err.value.reason == "number"


def test_meta_explain_rejects_numbers_for_rejections(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    monkeypatch.setattr(
        meta_coach, "_post_json",
        lambda *a: (200, chat_response(
            {"explanation": "The short carries 6.0 A."})))
    with pytest.raises(coach.CoachProviderError) as err:
        provider.explain(facts={}, valid=False,
                         error_code="SHORTED_BATTERY",
                         component_ids=["B1"], switches={}, bulbs=[])
    assert err.value.reason == "number"


def test_meta_explain_rejects_empty_output(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *a: (200, chat_response({"explanation": " "})))
    with pytest.raises(coach.CoachProviderError) as err:
        provider.explain(facts={}, valid=False, error_code="EMPTY_CIRCUIT",
                         component_ids=[], switches={}, bulbs=[])
    assert err.value.reason == "not-explanation"


def test_meta_explain_request_shape(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    seen = {}

    def fake_post(url, payload, headers, timeout_s):
        seen.update(payload=payload, url=url, headers=headers)
        return 200, chat_response({"explanation": "Fine."})

    monkeypatch.setattr(meta_coach, "_post_json", fake_post)
    provider.explain(facts={}, valid=False, error_code="EMPTY_CIRCUIT",
                     component_ids=[], switches={}, bulbs=[])
    assert seen["url"] == "https://api.meta.ai/v1/chat/completions"
    assert seen["headers"]["Authorization"] == "Bearer test-key-1"
    schema = seen["payload"]["response_format"]["json_schema"]
    assert schema["name"] == "coach_explain"
    assert schema["schema"]["required"] == ["explanation"]


def test_explain_passes_conditions_batteries_and_limits():
    seen = {}

    class SpyProvider:
        name = "spy"

        def explain(self, **call):
            seen.update(call)
            return "seen"

    out = coach.explain_result(OVERLOAD_LOOP, SpyProvider())
    assert out["provider"] == "spy"
    assert seen["valid"] is True
    assert seen["conditions"] == {"L1": "overloaded"}
    assert seen["batteries"] == {"B1": 6, "B2": 6}
    assert seen["facts"]["L1.power_W"] == pytest.approx(14.4)
    assert seen["facts"]["L1.limit_W"] == 6
    assert seen["facts"]["L1.rated_V"] == 6
    assert seen["facts"]["batteries.count"] == 2.0
    assert seen["facts"]["batteries.total_V"] == 12.0


def test_explain_rejected_passes_empty_conditions():
    seen = {}

    class SpyProvider:
        name = "spy"

        def explain(self, **call):
            seen.update(call)
            return "seen"

    coach.explain_result(SHORTED, SpyProvider())
    assert seen["facts"] == {}
    assert seen["conditions"] == {}
    assert seen["batteries"] == {"B1": 6}


def test_explain_fake_overload_cites_measured_watts_and_limit():
    text = coach.explain_result(
        OVERLOAD_LOOP, fake_coach.FakeCoachProvider())["text"]
    assert "L1 drew 14.4 W, past its 6.0 W safe limit" in text
    assert "overloaded" in text


def test_explain_fake_damaged_names_the_open_bulb():
    text = coach.explain_result(
        DAMAGED_LOOP, fake_coach.FakeCoachProvider())["text"]
    assert "L1 is damaged and no longer completes the circuit" in text
    assert "0.0 A and 0.0 W" in text


def test_meta_explain_message_carries_conditions_and_batteries(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    seen = {}

    def fake_post(url, payload, headers, timeout_s):
        seen.update(payload=payload)
        return 200, chat_response({"explanation": "Fine."})

    monkeypatch.setattr(meta_coach, "_post_json", fake_post)
    facts = {"L1.power_W": 14.4, "L1.current_A": 1.2,
             "L1.voltage_V": 12.0, "L1.limit_W": 6,
             "L1.rated_V": 6, "batteries.count": 2.0,
             "batteries.total_V": 12.0}
    provider.explain(facts=facts, valid=True, error_code=None,
                     component_ids=[], switches={},
                     bulbs=["L1"], conditions={"L1": "overloaded"},
                     batteries={"B1": 6, "B2": 6})
    user_text = seen["payload"]["messages"][1]["content"]
    assert '"L1": "overloaded"' in user_text
    assert '"B1": 6' in user_text and '"B2": 6' in user_text
    assert "14.4" in user_text


def test_meta_explain_accepts_limit_citation(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    text = "L1 drew 14.4 W, past its 6 W safe limit."
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *a: (200, chat_response({"explanation": text})))
    facts = {"L1.power_W": 14.4, "L1.current_A": 1.2,
             "L1.voltage_V": 12.0, "L1.limit_W": 6,
             "L1.rated_V": 6, "batteries.count": 2.0,
             "batteries.total_V": 12.0}
    assert provider.explain(facts=facts, valid=True, error_code=None,
                            component_ids=[], switches={},
                            bulbs=["L1"]) == text
