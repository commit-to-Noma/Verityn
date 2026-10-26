"""Fresh Milestone 3 tests: evaluator verdicts against real solver output.

Covers every verdict, both v1 claim types, solver failures, invalid
targets, tolerance edges, determinism, and no mutation.
"""

import copy
import pathlib
from types import SimpleNamespace

import pytest

from verityn import evaluator, solver
from verityn.evaluator import (
    CONSISTENT,
    CONTRADICTED,
    INVALID_TARGET,
    MALFORMED_CLAIM,
    UNASSESSABLE,
    UNKNOWN_COMPONENT,
    evaluate,
)


def battery(cid, volts, a, b):
    return {"id": cid, "type": "battery", "volts": volts, "a": a, "b": b}


def resistor(cid, ohms, a, b):
    return {"id": cid, "type": "resistor", "ohms": ohms, "a": a, "b": b}


def bulb(cid, a, b):
    return {"id": cid, "type": "bulb", "a": a, "b": b}


def switch(cid, closed, a, b):
    return {"id": cid, "type": "switch", "closed": closed, "a": a, "b": b}


def wire(cid, a, b):
    return {"id": cid, "type": "wire", "a": a, "b": b}


def netlist(*comps):
    return {"components": list(comps)}


def lit(cid, value):
    return {"type": "lit", "component": cid, "value": value}


def brighter(first, second):
    return {"type": "compare_brightness", "a": first, "b": second,
            "relation": "brighter"}


def dimmer(first, second):
    return {"type": "compare_brightness", "a": first, "b": second,
            "relation": "dimmer"}


def equal(first, second):
    return {"type": "compare_brightness", "a": first, "b": second,
            "relation": "equal"}


def manual_result(powers):
    return solver.SolveResult(
        ok=True, node_voltages={},
        components={cid: {"voltage": 0.0, "current": 0.0, "power": power}
                    for cid, power in powers.items()})


def manual_netlist(*cids):
    return netlist(*[bulb(cid, "p", "0") for cid in cids])


def solved(nl):
    result = solver.solve(copy.deepcopy(nl))
    assert result.ok
    return result


# ------------------------------------------------------------------- lit
def test_lit_true_when_bulb_dissipates_power():
    nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"))
    verdict = evaluate(lit("L1", True), nl, solved(nl))
    assert verdict.status == CONSISTENT
    assert verdict.reason is None
    assert verdict.evidence["L1.power_W"] == pytest.approx(3.6)


def test_lit_false_when_bulb_is_unlit():
    nl = netlist(battery("B1", 5, "p", "0"),
                 switch("S1", False, "p", "n1"), bulb("L1", "n1", "0"))
    verdict = evaluate(lit("L1", False), nl, solved(nl))
    assert verdict.status == CONSISTENT
    assert verdict.evidence["L1.power_W"] == pytest.approx(0.0)


def test_lit_wrong_value_is_contradicted():
    lit_nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"))
    assert evaluate(lit("L1", False), lit_nl, solved(lit_nl)).status == CONTRADICTED
    dark_nl = netlist(battery("B1", 5, "p", "0"),
                      switch("S1", False, "p", "n1"), bulb("L1", "n1", "0"))
    assert evaluate(lit("L1", True), dark_nl, solved(dark_nl)).status == CONTRADICTED


# ------------------------------------------------------ brightness order
def test_series_bulbs_are_equally_bright():
    # 6 V across 20 ohm: 0.3 A, 3 V and 0.9 W each.
    nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "m"),
                 bulb("L2", "m", "0"))
    result = solved(nl)
    assert evaluate(equal("L1", "L2"), nl, result).status == CONSISTENT
    assert evaluate(brighter("L1", "L2"), nl, result).status == CONTRADICTED


def test_series_bulb_brighter_than_parallel_branch():
    # LA carries 0.6 A (3.6 W); LB and LC carry 0.3 A (0.9 W each).
    nl = netlist(battery("B1", 9, "p", "0"), bulb("LA", "p", "m"),
                 bulb("LB", "m", "0"), bulb("LC", "m", "0"))
    result = solved(nl)
    assert evaluate(brighter("LA", "LB"), nl, result).status == CONSISTENT
    assert evaluate(dimmer("LB", "LA"), nl, result).status == CONSISTENT
    assert evaluate(equal("LA", "LB"), nl, result).status == CONTRADICTED
    assert evaluate(equal("LB", "LC"), nl, result).status == CONSISTENT


def test_evidence_keys_and_values_are_exact():
    verdict = evaluate(brighter("LA", "LB"), manual_netlist("LA", "LB"),
                       manual_result({"LA": 100.0, "LB": 50.0}))
    assert verdict.status == CONSISTENT
    assert verdict.evidence == {"LA.power_W": 100.0, "LB.power_W": 50.0}


def test_evidence_holds_model_values_not_learner_values():
    nl = netlist(battery("B1", 5, "p", "0"),
                 switch("S1", False, "p", "n1"), bulb("L1", "n1", "0"))
    verdict = evaluate(lit("L1", True), nl, solved(nl))
    assert verdict.status == CONTRADICTED
    assert verdict.evidence["L1.power_W"] == pytest.approx(0.0)
    assert "value" not in verdict.evidence
    assert "claimed" not in verdict.evidence


# ---------------------------------------------------- unsupported claims
@pytest.mark.parametrize("claim", [
    {"type": "value", "component": "L1", "quantity": "current", "approx": 1},
    {"type": "compare_current", "a": "L1", "b": "L2", "relation": "equal"},
    {"type": "compare_voltage", "a": "L1", "b": "L2", "relation": "equal"},
    {"type": "burns_out", "component": "L1"},
    {"type": "lit"},
    {"component": "L1", "value": True},
    {"type": "lit", "component": "L1", "value": 1},
    {"type": "lit", "component": "L1", "value": "true"},
    {"type": "lit", "component": 7, "value": True},
    {"type": "compare_brightness", "a": "L1", "relation": "equal"},
    {"type": "compare_brightness", "a": "L1", "b": "L2"},
    {"type": "compare_brightness", "a": "L1", "b": "L2",
     "relation": "brightest"},
    {"type": "compare_brightness", "a": ["L1"], "b": "L2",
     "relation": "equal"},
    None, "lit", [], 42,
], ids=["value", "compare-current", "compare-voltage", "unknown-type",
        "lit-missing-fields", "missing-type", "value-one", "value-text",
        "component-not-str", "compare-missing-b", "compare-missing-relation",
        "bad-relation", "a-not-str", "none", "text", "list", "number"])
def test_unsupported_or_malformed_claim_is_unassessable(claim):
    nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"),
                 bulb("L2", "p", "0"))
    verdict = evaluate(claim, nl, solved(nl))
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == MALFORMED_CLAIM
    assert verdict.evidence == {}


# ------------------------------------------------------ solver failures
def _rejected(netlist_dict):
    result = solver.solve(netlist_dict)
    assert not result.ok
    return result


@pytest.mark.parametrize("bad, claim", [
    (netlist(battery("B1", 6, "p", "0"), wire("W1", "p", "0")),
     lit("L1", True)),
    (netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "n1")),
     equal("L1", "L1")),
    (netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "m"),
             wire("W1", "m", "0"), wire("W2", "m", "0")),
     brighter("L1", "L1")),
])
def test_rejected_circuit_is_never_judged(bad, claim):
    result = _rejected(copy.deepcopy(bad))
    verdict = evaluate(copy.deepcopy(claim), copy.deepcopy(bad), result)
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == result.error_code
    assert verdict.evidence == {}


def test_solver_failure_beats_malformed_claim():
    bad = netlist(battery("B1", 6, "p", "0"), wire("W1", "p", "0"))
    result = _rejected(bad)
    verdict = evaluate({"type": "nonsense"}, bad, result)
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == solver.SHORTED_BATTERY


# ------------------------------------------------- unknown and invalid
def test_unknown_component_ids_are_unassessable():
    nl = netlist(battery("B1", 6, "p", "0"), bulb("LA", "p", "m"),
                 bulb("LB", "m", "0"), bulb("LC", "m", "0"))
    result = solved(nl)
    assert evaluate(lit("L9", True), nl, result).reason == UNKNOWN_COMPONENT
    assert evaluate(equal("LA", "LD"), nl, result).reason == UNKNOWN_COMPONENT
    for verdict in (evaluate(lit("L9", True), nl, result),
                    evaluate(equal("LA", "LD"), nl, result)):
        assert verdict.status == UNASSESSABLE
        assert verdict.evidence == {}


@pytest.mark.parametrize("claim", [
    lit("R1", True), lit("B1", True), lit("W1", False), lit("S1", False),
    brighter("L1", "R1"), equal("B1", "L1"),
])
def test_non_bulb_targets_are_invalid(claim):
    nl = netlist(battery("B1", 6, "p", "0"), resistor("R1", 3, "p", "n1"),
                 wire("W1", "n1", "n2"), switch("S1", True, "n2", "n3"),
                 bulb("L1", "n3", "0"))
    verdict = evaluate(claim, nl, solved(nl))
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == INVALID_TARGET
    assert verdict.evidence == {}


def test_malformed_netlist_yields_unknown_component():
    verdict = evaluate(lit("L1", True), {"components": "nope"},
                       manual_result({"L1": 3.6}))
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == UNKNOWN_COMPONENT


def test_missing_component_in_solution_is_unknown():
    nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"))
    verdict = evaluate(lit("L1", True), nl, manual_result({"L2": 3.6}))
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == UNKNOWN_COMPONENT


# ------------------------------------------------------- broken results
@pytest.mark.parametrize("result", [
    None, {}, "ok", [],
    SimpleNamespace(ok=False, error_code=""),
    SimpleNamespace(ok=False, error_code=None),
])
def test_missing_or_garbage_result_is_unassessable(result):
    nl = netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"))
    verdict = evaluate(lit("L1", True), nl, result)
    assert verdict.status == UNASSESSABLE
    assert verdict.reason == evaluator.SOLVER_FAILED
    assert verdict.evidence == {}


# ------------------------------------------------------------- tolerance
def test_brightness_within_one_percent_counts_as_equal():
    nl = manual_netlist("L1", "L2")
    verdict = evaluate(equal("L1", "L2"), nl,
                       manual_result({"L1": 100.0, "L2": 100.9}))
    assert verdict.status == CONSISTENT


def test_brightness_beyond_one_percent_is_not_equal():
    nl = manual_netlist("L1", "L2")
    result = manual_result({"L1": 100.0, "L2": 102.0})
    assert evaluate(equal("L1", "L2"), nl, result).status == CONTRADICTED
    assert evaluate(dimmer("L1", "L2"), nl, result).status == CONSISTENT
    assert evaluate(brighter("L1", "L2"), nl, result).status == CONTRADICTED


def test_two_unlit_bulbs_are_equal_not_brighter():
    nl = manual_netlist("L1", "L2")
    result = manual_result({"L1": 0.0, "L2": 5e-16})
    assert evaluate(equal("L1", "L2"), nl, result).status == CONSISTENT
    assert evaluate(brighter("L1", "L2"), nl, result).status == CONTRADICTED


def test_floating_point_noise_counts_as_unlit():
    nl = manual_netlist("L1")
    result = manual_result({"L1": 5e-16})
    assert evaluate(lit("L1", False), nl, result).status == CONSISTENT
    assert evaluate(lit("L1", True), nl, result).status == CONTRADICTED


# ------------------------------------------------------------ namespaces
def test_claim_and_solver_reason_namespaces_are_disjoint():
    solver_codes = {solver.MALFORMED_NETLIST, solver.INVALID_VALUE,
                    solver.EMPTY_CIRCUIT, solver.NO_BATTERY,
                    solver.DANGLING_TERMINAL, solver.FLOATING_COMPONENT,
                    solver.SHORTED_BATTERY, solver.CONFLICTING_SOURCES,
                    solver.UNSOLVABLE}
    assert evaluator.CLAIM_REASONS.isdisjoint(solver_codes)
    assert len(solver_codes) == 9


# -------------------------------------------------- determinism, purity
def test_same_inputs_give_same_verdict():
    nl = netlist(battery("B1", 9, "p", "0"), bulb("LA", "p", "m"),
                 bulb("LB", "m", "0"), bulb("LC", "m", "0"))
    result = solved(nl)
    first = evaluate(brighter("LA", "LB"), nl, result)
    second = evaluate(brighter("LA", "LB"), nl, result)
    assert (first.status, first.reason, first.evidence) == \
        (second.status, second.reason, second.evidence)


def test_evaluate_does_not_mutate_its_inputs():
    nl = netlist(battery("B1", 9, "p", "0"), bulb("LA", "p", "m"),
                 bulb("LB", "m", "0"), bulb("LC", "m", "0"))
    result = solved(nl)
    broken = _rejected(netlist(battery("B1", 6, "p", "0"),
                               wire("W1", "p", "0")))
    cases = [
        (lit("LA", True), nl, result),
        (brighter("LA", "LB"), nl, result),
        ({"type": "nonsense"}, nl, result),
        (lit("L9", True), nl, result),
        (lit("LA", True), nl, broken),
        (None, None, None),
    ]
    for claim, target_netlist, target_result in cases:
        before = (copy.deepcopy(claim), copy.deepcopy(target_netlist),
                  copy.deepcopy(vars(target_result))
                  if hasattr(target_result, "__dict__") else target_result)
        evaluate(claim, target_netlist, target_result)
        after = (claim, target_netlist,
                 vars(target_result)
                 if hasattr(target_result, "__dict__") else target_result)
        assert after == before


def test_evaluator_is_independent_of_ai_and_networking():
    source = pathlib.Path(evaluator.__file__).read_text().lower()
    assert not [line for line in source.splitlines()
                if line.startswith(("import ", "from "))]
    for banned in ("socket", "requests", "urllib", "http", "openai",
                   "anthropic", "muse", "meta.ai"):
        assert banned not in source, f"evaluator must not mention {banned}"
