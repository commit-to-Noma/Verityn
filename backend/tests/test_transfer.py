"""Transfer tests: the solo second-bulb challenge against the real solver.

The transfer is a new parallel-branch task, not a relabelled Twist: the
learner predicts about L2, wires it across L1 with no AI coach, and the
evaluator judges the built circuit. The pack's start rejection, fixed
numbers, canvas shape, and verdicts are all proven here, and the coach
API demonstrably has no room for the transfer challenge id.
"""

import json
import pathlib

import pytest

from app import create_app
from verityn.evaluator import CONSISTENT, CONTRADICTED, evaluate
from verityn.solver import DANGLING_TERMINAL, solve

PACK_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "src" / "verityn" / "lessons" / "transfer.json"
)


@pytest.fixture(scope="module")
def transfer():
    return json.loads(PACK_PATH.read_text())


def fixed(netlist, wire):
    return {
        "components": (
            netlist["components"]
            + [{"id": "W10", "type": "wire",
                "a": wire["a"], "b": wire["b"]}]
        )
    }


def test_transfer_start_is_rejected_dangling(transfer):
    states = {comp["id"]: comp for comp in transfer["start"]["components"]}
    assert states["S1"]["closed"] is True
    assert states["L2"]["a"] == states["L1"]["a"]
    result = solve(transfer["start"])
    assert result.ok is False
    assert result.error_code == DANGLING_TERMINAL
    assert result.component_ids == ["L2"]
    assert transfer["expectedStart"]["lit"] is False


def test_transfer_fix_lights_the_second_bulb(transfer):
    result = solve(fixed(transfer["start"], transfer["fix"]["wire"]))
    assert result.ok is True
    lamp = result.components["L2"]
    assert lamp["current"] == pytest.approx(0.6)
    assert lamp["power"] == pytest.approx(3.6)
    assert result.components["L1"]["power"] == pytest.approx(3.6)
    expected = transfer["expectedFixed"]
    assert expected["lit"] is True
    assert lamp["current"] == pytest.approx(expected["current"])
    assert lamp["power"] == pytest.approx(expected["power"])


def test_transfer_canvas_shape_needs_the_wire(transfer):
    """The exact netlist the transfer seed produces, before and after."""
    seed_netlist = {
        "components": [
            {"id": "B1", "type": "battery", "volts": 6,
             "a": "B1.a", "b": "B1.b"},
            {"id": "S1", "type": "switch", "closed": True,
             "a": "S1.a", "b": "S1.b"},
            {"id": "L1", "type": "bulb", "a": "L1.a", "b": "L1.b"},
            {"id": "L2", "type": "bulb", "a": "L2.a", "b": "L2.b"},
            {"id": "W1", "type": "wire", "a": "B1.a", "b": "S1.a"},
            {"id": "W2", "type": "wire", "a": "S1.b", "b": "L1.a"},
            {"id": "W3", "type": "wire", "a": "L1.b", "b": "B1.b"},
            {"id": "W4", "type": "wire", "a": "L2.a", "b": "L1.a"},
        ]
    }
    broken = solve(seed_netlist)
    assert broken.ok is False
    assert broken.error_code == DANGLING_TERMINAL
    assert broken.component_ids == ["L2"]
    wired = {
        "components": (
            seed_netlist["components"]
            + [{"id": "W5", "type": "wire", "a": "L2.b", "b": "L1.b"}]
        )
    }
    result = solve(wired)
    assert result.ok is True
    assert result.components["L2"]["power"] == pytest.approx(3.6)
    assert transfer["expectedFixed"]["power"] == 3.6


def test_recorded_yes_is_consistent(transfer):
    netlist = fixed(transfer["start"], transfer["fix"]["wire"])
    verdict = evaluate(
        {"type": "lit", "component": "L2", "value": True},
        netlist,
        solve(netlist),
    )
    assert verdict.status == CONSISTENT


def test_recorded_no_is_contradicted(transfer):
    netlist = fixed(transfer["start"], transfer["fix"]["wire"])
    verdict = evaluate(
        {"type": "lit", "component": "L2", "value": False},
        netlist,
        solve(netlist),
    )
    assert verdict.status == CONTRADICTED


def test_transfer_prediction_is_rejected_by_coach(transfer):
    """No coaching session can exist for the transfer: solo by design."""
    client = create_app().test_client()
    res = client.post("/api/coach/predict", json={
        "challenge_id": transfer["id"], "choice": "yes", "why": "x"})
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"
