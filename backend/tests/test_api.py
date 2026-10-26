"""Fresh Milestone 4 tests: Flask API over solver and evaluator.

Covers valid requests, malformed bodies and fields, missing keys,
invalid circuits and claims, solver-failure precedence, and JSON-only
errors with no stack traces.
"""

import pytest

from app import create_app


def _approx_evidence(power):
    return pytest.approx({"L1.power_W": power})


@pytest.fixture()
def client():
    return create_app().test_client()


def battery(cid, volts, a, b):
    return {"id": cid, "type": "battery", "volts": volts, "a": a, "b": b}


def resistor(cid, ohms, a, b):
    return {"id": cid, "type": "resistor", "ohms": ohms, "a": a, "b": b}


def bulb(cid, a, b):
    return {"id": cid, "type": "bulb", "a": a, "b": b}


def wire(cid, a, b):
    return {"id": cid, "type": "wire", "a": a, "b": b}


def netlist(*comps):
    return {"components": list(comps)}


def lit(cid, value):
    return {"type": "lit", "component": cid, "value": value}


# ---------------------------------------------------------------- simulate
def test_simulate_valid_circuit_returns_exact_numbers(client):
    res = client.post("/api/simulate", json=netlist(
        battery("B1", 6, "p", "0"), resistor("R1", 3, "p", "0")))
    assert res.status_code == 200
    assert res.get_json() == {
        "ok": True,
        "node_voltages": {"p": 6.0, "0": 0.0},
        "components": {
            "B1": {"voltage": 6.0, "current": -2.0, "power": -12.0},
            "R1": {"voltage": 6.0, "current": 2.0, "power": 12.0},
        },
        "error_code": None,
        "error_message": "",
        "component_ids": [],
    }


def test_simulate_invalid_circuit_is_judged_not_rejected(client):
    res = client.post("/api/simulate", json=netlist(
        battery("B1", 6, "p", "0"), wire("W1", "p", "0")))
    assert res.status_code == 200
    body = res.get_json()
    assert body["ok"] is False
    assert body["error_code"] == "SHORTED_BATTERY"
    assert sorted(body["component_ids"]) == ["B1", "W1"]
    assert body["error_message"]
    assert body["node_voltages"] == {}
    assert body["components"] == {}


@pytest.mark.parametrize("bad", [{}, {"components": "nope"},
                                 {"components": [{"id": "B1"}]}])
def test_simulate_malformed_netlist_is_judged_by_solver(client, bad):
    res = client.post("/api/simulate", json=bad)
    assert res.status_code == 200
    assert res.get_json()["error_code"] == "MALFORMED_NETLIST"


@pytest.mark.parametrize("raw", ["not json", "", "[1, 2", "{unclosed"])
def test_simulate_malformed_json_returns_400(client, raw):
    res = client.post("/api/simulate", data=raw,
                      content_type="application/json")
    assert res.status_code == 400
    assert res.is_json
    body = res.get_json()
    assert body["error_code"] == "MALFORMED_REQUEST"
    assert body["error_message"]
    assert "Traceback" not in res.get_data(as_text=True)


@pytest.mark.parametrize("body", [[], [1], "nope", 42, None])
def test_simulate_non_object_json_returns_400(client, body):
    res = client.post("/api/simulate", json=body)
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"


def test_simulate_is_deterministic(client):
    nl = netlist(battery("B1", 9, "p", "0"), bulb("LA", "p", "m"),
                 bulb("LB", "m", "0"), bulb("LC", "m", "0"))
    first = client.post("/api/simulate", json=nl)
    second = client.post("/api/simulate", json=nl)
    assert first.get_json() == second.get_json()


def test_simulate_rejects_get(client):
    res = client.get("/api/simulate")
    assert res.status_code == 405
    assert res.is_json


# ---------------------------------------------------------------- evaluate
def test_evaluate_consistent_claim(client):
    nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"))
    res = client.post("/api/evaluate",
                      json={"claim": lit("L1", True), "netlist": nl})
    assert res.status_code == 200
    body = res.get_json()
    assert body["verdict"]["status"] == "CONSISTENT"
    assert body["verdict"]["reason"] is None
    assert body["verdict"]["evidence"] == _approx_evidence(3.6)
    assert body["result"]["ok"] is True
    assert body["result"]["components"]["L1"]["power"] == pytest.approx(3.6)


def test_evaluate_contradicted_claim(client):
    nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"))
    res = client.post("/api/evaluate",
                      json={"claim": lit("L1", False), "netlist": nl})
    assert res.status_code == 200
    body = res.get_json()
    assert body["verdict"]["status"] == "CONTRADICTED"
    assert body["verdict"]["evidence"] == _approx_evidence(3.6)


@pytest.mark.parametrize("claim, reason", [
    ({"type": "value", "component": "L1"}, "MALFORMED_CLAIM"),
    (lit("L9", True), "UNKNOWN_COMPONENT"),
    (lit("R1", True), "INVALID_TARGET"),
])
def test_evaluate_claim_problems_stay_claim_side(client, claim, reason):
    nl = netlist(battery("B1", 6, "p", "0"),
                 resistor("R1", 3, "p", "n1"), bulb("L1", "n1", "0"))
    res = client.post("/api/evaluate", json={"claim": claim, "netlist": nl})
    assert res.status_code == 200
    body = res.get_json()
    assert body["result"]["ok"] is True
    assert body["verdict"]["status"] == "UNASSESSABLE"
    assert body["verdict"]["reason"] == reason
    assert body["verdict"]["evidence"] == {}


def test_evaluate_solver_failure_gives_unassessable(client):
    nl = netlist(battery("B1", 6, "p", "0"), wire("W1", "p", "0"))
    res = client.post("/api/evaluate",
                      json={"claim": lit("L1", True), "netlist": nl})
    assert res.status_code == 200
    body = res.get_json()
    assert body["result"]["ok"] is False
    assert body["result"]["error_code"] == "SHORTED_BATTERY"
    assert body["verdict"]["status"] == "UNASSESSABLE"
    assert body["verdict"]["reason"] == "SHORTED_BATTERY"
    assert body["verdict"]["evidence"] == {}


def test_evaluate_solver_failure_beats_malformed_claim(client):
    nl = netlist(battery("B1", 6, "p", "0"), wire("W1", "p", "0"))
    res = client.post("/api/evaluate",
                      json={"claim": {"type": "nonsense"}, "netlist": nl})
    assert res.status_code == 200
    assert res.get_json()["verdict"]["reason"] == "SHORTED_BATTERY"


@pytest.mark.parametrize("body", [
    {"claim": lit("L1", True)},
    {"netlist": netlist()},
    {},
    [],
    "nope",
    None,
])
def test_evaluate_missing_keys_or_shapes_return_400(client, body):
    res = client.post("/api/evaluate", json=body)
    assert res.status_code == 400
    assert res.is_json
    payload = res.get_json()
    assert payload["error_code"] == "MALFORMED_REQUEST"
    assert payload["result"] is None
    assert payload["verdict"] is None
    assert "Traceback" not in res.get_data(as_text=True)


def test_evaluate_malformed_json_returns_400(client):
    res = client.post("/api/evaluate", data="{oops",
                      content_type="application/json")
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"


def test_evaluate_is_deterministic(client):
    payload = {"claim": lit("L1", True), "netlist": netlist(
        battery("B1", 6, "p", "0"), bulb("L1", "p", "0"))}
    first = client.post("/api/evaluate", json=payload)
    second = client.post("/api/evaluate", json=payload)
    assert first.get_json() == second.get_json()


# ------------------------------------------------------------------- errors
def test_unknown_route_returns_json_404(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.is_json
    assert res.get_json()["error_code"] == "NOT_FOUND"


def test_wrong_method_returns_json_405(client):
    res = client.post("/api/health")
    assert res.status_code == 405
    assert res.is_json
    assert res.get_json()["error_code"] == "METHOD_NOT_ALLOWED"


def test_error_responses_are_json_without_tracebacks(client):
    res = client.post("/api/simulate", data="!!!",
                      content_type="application/json")
    assert res.is_json
    assert "Traceback" not in res.get_data(as_text=True)
