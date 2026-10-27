"""Fresh M7b tests: the fixed L1 lesson pack against the real solver.

The pack is the single source of truth for L1's circuits, but code stays
the source of truth for physics: these tests prove the solver really
rejects the pack's start circuit, really lights the fixed circuit, and
that the evaluator refuses the broken start (so its outcome must live
in the pack, never be read from the evaluator).
"""

import copy
import json
import pathlib

import pytest

from verityn.evaluator import UNASSESSABLE, evaluate
from verityn.solver import DANGLING_TERMINAL, solve

PACK_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "src" / "verityn" / "lessons" / "l1.json"
)


@pytest.fixture(scope="module")
def pack():
    return json.loads(PACK_PATH.read_text())


def test_start_is_rejected_dangling(pack):
    expected = pack["expectedStart"]
    result = solve(pack["start"])
    assert result.ok is False
    assert result.error_code == DANGLING_TERMINAL
    assert result.component_ids == ["B1", "L1"]
    assert expected["code"] == DANGLING_TERMINAL
    assert expected["component_ids"] == ["B1", "L1"]
    assert expected["lit"] is False


def test_fix_wire_lights_the_bulb(pack):
    wire = pack["fix"]["wire"]
    assert wire == {"a": "n1", "b": "0"}
    fixed = {
        "components": (
            pack["start"]["components"]
            + [{"id": "W9", "type": "wire", "a": wire["a"], "b": wire["b"]}]
        )
    }
    result = solve(fixed)
    assert result.ok is True
    lamp = result.components["L1"]
    assert lamp["current"] == pytest.approx(0.6)
    assert lamp["power"] == pytest.approx(3.6)
    expected = pack["expectedFixed"]
    assert expected["lit"] is True
    assert lamp["current"] == pytest.approx(expected["current"])
    assert lamp["power"] == pytest.approx(expected["power"])


def test_evaluator_refuses_the_broken_start(pack):
    result = solve(pack["start"])
    verdict = evaluate(
        {"type": "lit", "component": "L1", "value": False},
        pack["start"],
        result,
    )
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == DANGLING_TERMINAL


def test_solver_does_not_mutate_the_pack(pack):
    frozen = copy.deepcopy(pack)
    solve(pack["start"])
    assert pack == frozen
