"""Fresh M7c tests: the L1 Twist (open switch) against the real solver.

The twist changes one condition -- S1 open instead of closed -- and the
locked twist rule applies: the twisted circuit must solve validly and its
outcome must differ from the original. Because the fixed twisted circuit
is valid, the evaluator can judge claims about it, which is what the
transfer verdict rests on.
"""

import json
import pathlib

import pytest

from verityn.evaluator import CONSISTENT, CONTRADICTED, evaluate
from verityn.solver import DANGLING_TERMINAL, solve

PACK_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "src" / "verityn" / "lessons" / "l1.json"
)


@pytest.fixture(scope="module")
def pack():
    return json.loads(PACK_PATH.read_text())


@pytest.fixture(scope="module")
def twist(pack):
    return pack["twist"]


def fixed(netlist, wire):
    return {
        "components": (
            netlist["components"]
            + [{"id": "W9", "type": "wire", "a": wire["a"], "b": wire["b"]}]
        )
    }


def test_twist_start_is_rejected_dangling(twist):
    states = {comp["id"]: comp for comp in twist["start"]["components"]}
    assert states["S1"]["closed"] is False
    result = solve(twist["start"])
    assert result.ok is False
    assert result.error_code == DANGLING_TERMINAL
    assert result.component_ids == ["B1", "L1"]
    assert twist["expectedStart"]["lit"] is False


def test_twist_fix_is_valid_but_dark(twist, pack):
    result = solve(fixed(twist["start"], twist["fix"]["wire"]))
    assert result.ok is True
    lamp = result.components["L1"]
    assert lamp["current"] == pytest.approx(0.0)
    assert lamp["power"] == pytest.approx(0.0)
    original = solve(fixed(pack["start"], pack["fix"]["wire"]))
    assert original.components["L1"]["power"] == pytest.approx(3.6)
    assert (
        abs(original.components["L1"]["power"] - lamp["power"]) > 1.0
    )
    expected = twist["expectedFixed"]
    assert expected["lit"] is False
    assert lamp["current"] == pytest.approx(expected["current"])
    assert lamp["power"] == pytest.approx(expected["power"])


def test_twist_canvas_seed_is_wired_with_s1_open(twist):
    """The exact netlist the twist seed produces: fully wired, S1 open."""
    seed_netlist = {
        "components": [
            {"id": "B1", "type": "battery", "volts": 6,
             "a": "B1.a", "b": "B1.b"},
            {"id": "S1", "type": "switch", "closed": False,
             "a": "S1.a", "b": "S1.b"},
            {"id": "L1", "type": "bulb", "a": "L1.a", "b": "L1.b"},
            {"id": "W1", "type": "wire", "a": "B1.a", "b": "S1.a"},
            {"id": "W2", "type": "wire", "a": "S1.b", "b": "L1.a"},
            {"id": "W3", "type": "wire", "a": "B1.b", "b": "L1.b"},
        ]
    }
    result = solve(seed_netlist)
    assert result.ok is True
    assert result.components["L1"]["power"] == pytest.approx(0.0)
    assert twist["expectedFixed"]["power"] == 0


def test_recorded_no_is_consistent(twist):
    netlist = fixed(twist["start"], twist["fix"]["wire"])
    verdict = evaluate(
        {"type": "lit", "component": "L1", "value": False},
        netlist,
        solve(netlist),
    )
    assert verdict.status == CONSISTENT


def test_recorded_yes_is_contradicted(twist):
    netlist = fixed(twist["start"], twist["fix"]["wire"])
    verdict = evaluate(
        {"type": "lit", "component": "L1", "value": True},
        netlist,
        solve(netlist),
    )
    assert verdict.status == CONTRADICTED
