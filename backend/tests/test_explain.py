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

OVERWORK_LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "m"},
    {"id": "B2", "type": "battery", "volts": 6, "a": "m", "b": "n"},
    {"id": "B3", "type": "battery", "volts": 6, "a": "n", "b": "0"},
    {"id": "L1", "type": "bulb", "a": "p", "b": "0"},
]}

EXPLODED_LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "L1", "type": "bulb", "condition": "exploded", "a": "p", "b": "0"},
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
    assert "Light 1 lit: 0.6 A and 3.6 W" in body["text"]
    assert "Switch 1" in body["text"]
    assert "L1" not in body["text"]
    assert "S1" not in body["text"]


def test_friendly_name_translates_canvas_ids():
    assert fake_coach.friendly_name("B1") == "Battery 1"
    assert fake_coach.friendly_name("L2") == "Light 2"
    assert fake_coach.friendly_name("S1") == "Switch 1"
    assert fake_coach.friendly_name("mystery") == "mystery"
    assert fake_coach.friendly_name("X9") == "X9"


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


def _explain_facts():
    return {"L1.power_W": 3.6, "L1.current_A": 0.6, "L1.voltage_V": 6.0}


def _explain_call(provider, facts):
    return provider.explain(facts=facts, valid=True, error_code=None,
                            component_ids=[], switches={"S1": True},
                            bulbs=["L1"])


def test_meta_explain_trims_trailing_question(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    calls = []

    def fake_post(*args):
        calls.append(args[1])
        return 200, chat_response(
            {"explanation": "L1 lit at 0.6 A and 3.6 W. What will you try next?"})
    monkeypatch.setattr(meta_coach, "_post_json", fake_post)
    assert _explain_call(provider, _explain_facts()) == "L1 lit at 0.6 A and 3.6 W."
    assert len(calls) == 1


def test_meta_explain_retries_when_trim_keeps_bad_numbers(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    calls = []
    replies = [
        {"explanation": "L1 reads 9.9 A everywhere. Agree with that?"},
        {"explanation": "L1 reads 0.6 A with S1 closed."},
    ]

    def fake_post(url, payload, headers, timeout_s):
        calls.append(payload)
        return 200, chat_response(replies[min(len(calls) - 1, 1)])
    monkeypatch.setattr(meta_coach, "_post_json", fake_post)
    assert _explain_call(provider, _explain_facts()) == "L1 reads 0.6 A with S1 closed."
    assert len(calls) == 2
    assert "ended with a question" in calls[1]["messages"][-1]["content"]


def test_meta_explain_retry_exhaustion_raises_question(monkeypatch):
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    calls = []

    def fake_post(url, payload, headers, timeout_s):
        calls.append(payload)
        return 200, chat_response({"explanation": "Why do you think so?"})
    monkeypatch.setattr(meta_coach, "_post_json", fake_post)
    with pytest.raises(coach.CoachProviderError) as err:
        _explain_call(provider, _explain_facts())
    assert err.value.reason == "question"
    assert err.value.attempts == 2
    assert len(calls) == 2


def test_explain_system_prompt_forbids_trailing_questions():
    assert "never a question" in meta_coach._EXPLAIN_SYSTEM
    assert "optionally one question" not in meta_coach._EXPLAIN_SYSTEM


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

    out = coach.explain_result(OVERWORK_LOOP, SpyProvider())
    assert out["provider"] == "spy"
    assert seen["valid"] is True
    assert seen["conditions"] == {"L1": "overworked"}
    assert seen["batteries"] == {"B1": 6, "B2": 6, "B3": 6}
    assert seen["facts"]["L1.power_W"] == pytest.approx(32.4)
    assert seen["facts"]["L1.limit_W"] == 14.4
    assert seen["facts"]["L1.rated_V"] == 12
    assert seen["facts"]["source.net_V"] == 18.0


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
    assert seen["batteries"] == {}


def test_explain_fake_overwork_cites_measured_watts_and_limit():
    text = coach.explain_result(
        OVERWORK_LOOP, fake_coach.FakeCoachProvider())["text"]
    assert "Light 1 drew 32.4 W, past its 14.4 W safe limit" in text
    assert "overworking it" in text


def test_explain_fake_exploded_names_the_open_bulb():
    text = coach.explain_result(
        EXPLODED_LOOP, fake_coach.FakeCoachProvider())["text"]
    assert "Light 1 exploded and no longer completes the circuit" in text
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
             "L1.rated_V": 6, "source.net_V": 12.0}
    provider.explain(facts=facts, valid=True, error_code=None,
                     component_ids=[], switches={},
                     bulbs=["L1"], conditions={"L1": "overloaded"},
                     batteries={"B1": 6, "B2": 6})
    user_text = seen["payload"]["messages"][1]["content"]
    assert '"L1": "overloaded"' in user_text
    assert '"B1": 6' in user_text and '"B2": 6' in user_text
    assert "14.4" in user_text


def test_explain_uses_net_solver_voltage_for_opposing_battery_bank():
    components = []
    for index in range(1, 10):
        if index <= 5:
            a, b = f"n{index}", f"n{index - 1}"
        else:
            a, b = f"n{index - 1}", f"n{index}"
        components.append({"id": f"B{index}", "type": "battery",
                           "volts": 24, "a": a, "b": b})
    components.append({"id": "L1", "type": "bulb", "a": "n9", "b": "n0"})
    seen = {}

    class SpyProvider:
        name = "spy"

        def explain(self, **call):
            seen.update(call)
            return "L1 reads 2.4 A and 57.6 W at 24 V."

    out = coach.explain_result({"components": components}, SpyProvider())
    assert out["text"] == "L1 reads 2.4 A and 57.6 W at 24 V."
    assert seen["facts"]["L1.power_W"] == 57.6
    assert seen["facts"]["source.net_V"] == 24.0
    assert seen["facts"]["source.opposed"] is True
    assert sum(seen["batteries"].values()) == 24.0
    assert all("999994" not in repr(value) for value in seen["facts"].values())


def test_explain_flags_opposition_when_sources_cancel_at_zero_current():
    netlist = {"components": [
        {"id": "B1", "type": "battery", "volts": 6, "a": "n1", "b": "n0"},
        {"id": "B2", "type": "battery", "volts": 6, "a": "n1", "b": "n2"},
        {"id": "L1", "type": "bulb", "a": "n2", "b": "n0"},
    ]}
    seen = {}

    class SpyProvider:
        name = "spy"

        def explain(self, **call):
            seen.update(call)
            return "seen"

    coach.explain_result(netlist, SpyProvider())
    assert seen["facts"]["source.net_V"] == 0.0
    assert seen["facts"]["source.opposed"] is True


def test_meta_explain_prompt_labels_net_voltage_and_cancellation():
    provider = meta_coach.MetaSparkProvider(api_key="test-key-1")
    seen = {}

    def fake_post(url, payload, headers, timeout_s):
        seen.update(payload=payload)
        return 200, chat_response({"explanation": "The bulb receives 24 V."})

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(meta_coach, "_post_json", fake_post)
    facts = {"B1.current_A": -2.4, "B2.current_A": 2.4,
             "L1.power_W": 57.6, "source.net_V": 24.0,
             "source.opposed": True}
    provider.explain(facts=facts, valid=True, error_code=None,
                     component_ids=[], switches={}, bulbs=["L1"],
                     batteries={"B1": 24, "B2": -24})
    user_text = seen["payload"]["messages"][1]["content"]
    assert "Solver-measured net source voltage: 24.0 V" in user_text
    assert "Some batteries face opposite directions and partly cancel." in user_text
    assert "57.599999999999994" not in user_text
    monkeypatch.undo()


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


def test_explain_dangling_names_the_loose_parts(client):
    res = client.post("/api/coach/explain", json={"netlist": {"components": [
        {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
        {"id": "L1", "type": "bulb", "a": "p", "b": "q"},
    ]}})
    body = res.get_json()
    assert body["valid"] is False
    assert body["error_code"] == "DANGLING_TERMINAL"
    assert "Battery 1, Light 1 have a loose end" in body["text"]


def test_explain_shorted_names_the_battery(client):
    res = client.post("/api/coach/explain", json={"netlist": {"components": [
        {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
        {"id": "W1", "type": "wire", "a": "p", "b": "0"},
    ]}})
    body = res.get_json()
    assert body["valid"] is False
    assert body["error_code"] == "SHORTED_BATTERY"
    assert "connects Battery 1 straight back to itself" in body["text"]
