"""Fresh Milestone 2 tests: solver numbers, rejection codes, circuit laws.

Every expected value below was hand-computed for this milestone (see each
test's working). TEST_PLAN principles apply: exact expectations for
deterministic code.
"""

import copy

import pytest

from verityn.solver import (
    CONFLICTING_SOURCES,
    DANGLING_TERMINAL,
    EMPTY_CIRCUIT,
    FLOATING_COMPONENT,
    INVALID_VALUE,
    MALFORMED_NETLIST,
    NO_BATTERY,
    SHORTED_BATTERY,
    UNSOLVABLE,
    solve,
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


# ------------------------------------------------------------------ solved
def test_single_resistor():
    # I = 6/3 = 2 A through R1; battery returns it, so -2 A.
    result = solve(netlist(battery("B1", 6, "p", "0"), resistor("R1", 3, "p", "0")))
    assert result.ok
    assert result.node_voltages == {"p": 6.0, "0": 0.0}
    assert result.components["R1"] == {"voltage": 6.0, "current": 2.0, "power": 12.0}
    assert result.components["B1"] == {"voltage": 6.0, "current": -2.0, "power": -12.0}


def test_series_resistors():
    # Rtotal = 12, I = 1 A; drops 4 V and 8 V, middle node at 8 V.
    result = solve(netlist(battery("B1", 12, "p", "0"), resistor("R1", 4, "p", "m"),
                           resistor("R2", 8, "m", "0")))
    assert result.ok
    assert result.node_voltages == {"p": 12.0, "m": 8.0, "0": 0.0}
    assert result.components["R1"]["current"] == pytest.approx(1.0)
    assert result.components["R2"]["current"] == pytest.approx(1.0)
    assert result.components["R1"]["power"] == pytest.approx(4.0)
    assert result.components["R2"]["power"] == pytest.approx(8.0)
    assert result.components["B1"]["current"] == pytest.approx(-1.0)


def test_parallel_resistors():
    # 6/6 = 1 A and 6/3 = 2 A; the battery supplies 3 A.
    result = solve(netlist(battery("B1", 6, "p", "0"), resistor("R1", 6, "p", "0"),
                           resistor("R2", 3, "p", "0")))
    assert result.ok
    assert result.components["R1"]["current"] == pytest.approx(1.0)
    assert result.components["R2"]["current"] == pytest.approx(2.0)
    assert result.components["B1"]["current"] == pytest.approx(-3.0)


def test_bulb_is_a_fixed_10_ohm_resistor():
    # TEST_PLAN 3.3 anchor: 6 V across one bulb gives 0.6 A and 3.6 W.
    result = solve(netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0")))
    assert result.ok
    assert result.components["L1"]["voltage"] == pytest.approx(6.0)
    assert result.components["L1"]["current"] == pytest.approx(0.6)
    assert result.components["L1"]["power"] == pytest.approx(3.6)


def test_wire_in_series_has_no_voltage_but_carries_current():
    # Bulb = 10 ohm, I = 5/10 = 0.5 A; the wire drops 0 V.
    result = solve(netlist(battery("B1", 5, "p", "0"), wire("W1", "p", "n1"),
                           bulb("L1", "n1", "0")))
    assert result.ok
    assert result.components["W1"]["voltage"] == pytest.approx(0.0)
    assert result.components["W1"]["current"] == pytest.approx(0.5)
    assert result.components["L1"]["current"] == pytest.approx(0.5)
    assert result.components["L1"]["power"] == pytest.approx(2.5)


def test_closed_switch_behaves_like_a_wire():
    result = solve(netlist(battery("B1", 5, "p", "0"), switch("S1", True, "p", "n1"),
                           bulb("L1", "n1", "0")))
    assert result.ok
    assert result.components["S1"]["voltage"] == pytest.approx(0.0)
    assert result.components["S1"]["current"] == pytest.approx(0.5)
    assert result.components["L1"]["power"] == pytest.approx(2.5)


def test_open_switch_is_valid_with_zero_current_everywhere():
    # No path, so every current is 0; the open switch holds the full 5 V.
    result = solve(netlist(battery("B1", 5, "p", "0"), switch("S1", False, "p", "n1"),
                           bulb("L1", "n1", "0")))
    assert result.ok
    assert all(abs(v["current"]) < 1e-12 for v in result.components.values())
    assert result.components["S1"]["voltage"] == pytest.approx(5.0)


def test_shorted_bulb_is_valid_and_unlit():
    # The wire holds node m at 0 V: L2 gets 0 V, L1 carries 9/10 A.
    result = solve(netlist(battery("B1", 9, "p", "0"), bulb("L1", "p", "m"),
                           bulb("L2", "m", "0"), wire("W1", "m", "0")))
    assert result.ok
    assert result.components["L2"]["power"] == pytest.approx(0.0)
    assert result.components["L1"]["current"] == pytest.approx(0.9)
    assert result.components["W1"]["current"] == pytest.approx(0.9)


def test_two_batteries_in_series_aiding():
    # EMF = 12 V across 4 ohm: I = 3 A. Ground is B1's b terminal (m).
    result = solve(netlist(battery("B1", 6, "p", "m"), battery("B2", 6, "m", "0"),
                           resistor("R1", 4, "p", "0")))
    assert result.ok
    assert result.node_voltages == {"p": 6.0, "m": 0.0, "0": -6.0}
    assert result.components["R1"]["current"] == pytest.approx(3.0)
    assert result.components["B1"]["current"] == pytest.approx(-3.0)
    assert result.components["B2"]["current"] == pytest.approx(-3.0)


# ---------------------------------------------------------------- rejected
@pytest.mark.parametrize("bad, code, ids", [
    ({"components": []}, EMPTY_CIRCUIT, []),
    (netlist(bulb("L1", "x", "y"), bulb("L2", "y", "x")), NO_BATTERY, []),
    (netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "n1")),
     DANGLING_TERMINAL, ["B1", "L1"]),
    (netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"),
             bulb("L2", "x", "y"), bulb("L3", "y", "x")),
     FLOATING_COMPONENT, ["L2", "L3"]),
    (netlist(battery("B1", 6, "p", "0"), wire("W1", "p", "0")),
     SHORTED_BATTERY, ["B1", "W1"]),
    (netlist(battery("B1", 6, "p", "0"), switch("S1", True, "p", "0")),
     SHORTED_BATTERY, ["B1", "S1"]),
    (netlist(battery("B1", 6, "p", "0"), battery("B2", 3, "p", "0"),
             resistor("R1", 3, "p", "0")),
     CONFLICTING_SOURCES, ["B1", "B2"]),
    # Equal batteries in parallel conflict too: the split is undefined.
    (netlist(battery("B1", 6, "p", "0"), battery("B2", 6, "p", "0"),
             bulb("L1", "p", "0")),
     CONFLICTING_SOURCES, ["B1", "B2"]),
    (netlist(battery("B1", 6, "x", "x"), bulb("L1", "x", "y"),
             wire("W1", "y", "x")),
     SHORTED_BATTERY, ["B1"]),
    # Nodes reachable only through open switches have no defined potential.
    (netlist(battery("B1", 5, "p", "0"), switch("S1", False, "p", "n1"),
             switch("S2", False, "n1", "0")),
     UNSOLVABLE, []),
    (netlist(battery("B1", 6, "p", "0"), resistor("R1", -5, "p", "0")),
     INVALID_VALUE, ["R1"]),
    (netlist(battery("B1", 6, "p", "0"), resistor("R1", 0, "p", "0")),
     INVALID_VALUE, ["R1"]),
    (netlist(battery("B1", 0, "p", "0"), bulb("L1", "p", "0")),
     INVALID_VALUE, ["B1"]),
    # Parallel ideal shorts: the split is indeterminate, so no numbers.
    (netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "m"),
             wire("W1", "m", "0"), wire("W2", "m", "0")),
     UNSOLVABLE, []),
])
def test_rejected_with_code_and_parts(bad, code, ids):
    result = solve(copy.deepcopy(bad))
    assert result.ok is False
    assert result.error_code == code
    assert sorted(result.component_ids) == sorted(ids)
    assert isinstance(result.error_message, str) and result.error_message.strip()
    assert result.node_voltages == {}
    assert result.components == {}
    if ids:
        assert any(i in result.error_message for i in ids)


def test_opposing_batteries_charge_the_weaker_one():
    # Net EMF = 9 - 3 = 6 V across 3 ohm: I = 2 A. Ground is B1's b (m),
    # so Vp = 9 and V0 = 3. B2 absorbs power: it is being charged.
    result = solve(netlist(battery("B1", 9, "p", "m"), battery("B2", 3, "0", "m"),
                           resistor("R1", 3, "p", "0")))
    assert result.ok
    assert result.node_voltages == {"p": 9.0, "m": 0.0, "0": 3.0}
    assert result.components["R1"]["current"] == pytest.approx(2.0)
    assert result.components["R1"]["power"] == pytest.approx(12.0)
    assert result.components["B1"]["current"] == pytest.approx(-2.0)
    assert result.components["B2"]["current"] == pytest.approx(2.0)
    assert result.components["B2"]["power"] == pytest.approx(6.0)


@pytest.mark.parametrize("bad", [
    netlist(battery("B1", float("nan"), "p", "0"), bulb("L1", "p", "0")),
    netlist(battery("B1", float("inf"), "p", "0"), bulb("L1", "p", "0")),
    netlist(battery("B1", float("-inf"), "p", "0"), bulb("L1", "p", "0")),
    netlist(battery("B1", 6, "p", "0"), resistor("R1", float("nan"), "p", "0")),
    netlist(battery("B1", 6, "p", "0"), resistor("R1", float("inf"), "p", "0")),
], ids=["nan-volts", "inf-volts", "neg-inf-volts", "nan-ohms", "inf-ohms"])
def test_nonfinite_values_are_rejected_as_invalid(bad):
    result = solve(bad)
    assert result.ok is False
    assert result.error_code == INVALID_VALUE
    assert result.error_message


def test_detection_order_invalid_value_beats_dangling():
    # R1 is both negative and half-wired: the value check comes first.
    result = solve(netlist(battery("B1", 6, "p", "0"),
                           resistor("R1", -5, "p", "n1")))
    assert result.ok is False
    assert result.error_code == INVALID_VALUE
    assert result.component_ids == ["R1"]


def test_detection_order_dangling_beats_floating():
    result = solve(netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"),
                           bulb("L2", "x", "y"), bulb("L3", "y", "z")))
    assert result.ok is False
    assert result.error_code == DANGLING_TERMINAL
    assert sorted(result.component_ids) == ["L2", "L3"]


def test_detection_order_floating_beats_shorted():
    result = solve(netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"),
                           battery("B2", 6, "x", "x"),
                           bulb("L2", "u", "v"), bulb("L3", "v", "u")))
    assert result.ok is False
    assert result.error_code == FLOATING_COMPONENT
    assert result.component_ids == ["L2", "L3"]


def test_first_floating_group_in_component_order_is_reported():
    result = solve(netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0"),
                           bulb("L2", "x", "y"), bulb("L3", "y", "x"),
                           bulb("L4", "u", "v"), bulb("L5", "v", "u")))
    assert result.ok is False
    assert result.error_code == FLOATING_COMPONENT
    assert result.component_ids == ["L2", "L3"]


@pytest.mark.parametrize("junk", [
    None, [], {}, "circuit",
    {"components": "not a list"},
    {"components": [None]},
    {"components": [{"id": "C1", "type": "capacitor", "a": "p", "b": "0"}]},
    {"components": [{"id": "B1", "type": "battery", "a": "p", "b": "0"}]},
    {"components": [{"id": "R1", "type": "resistor", "ohms": "ten",
                     "a": "p", "b": "0"}]},
    {"components": [{"id": "S1", "type": "switch", "closed": "yes",
                     "a": "p", "b": "0"}]},
    {"components": [{"type": "wire", "a": "p", "b": "0"}]},
    {"components": [wire("W1", "p", "0"), wire("W1", "p", "0")]},
], ids=["none", "list", "empty-dict", "text", "components-not-list",
        "null-item", "unknown-type", "battery-no-volts", "ohms-text",
        "closed-text", "missing-id", "duplicate-id"])
def test_garbage_is_rejected_without_crashing(junk):
    result = solve(junk)
    assert result.ok is False
    assert result.error_code == MALFORMED_NETLIST
    assert result.error_message


# ------------------------------------------------------------------- laws
VALID_CASES = [
    netlist(battery("B1", 6, "p", "0"), resistor("R1", 3, "p", "0")),
    netlist(battery("B1", 12, "p", "0"), resistor("R1", 4, "p", "m"),
            resistor("R2", 8, "m", "0")),
    netlist(battery("B1", 6, "p", "0"), resistor("R1", 6, "p", "0"),
            resistor("R2", 3, "p", "0")),
    netlist(battery("B1", 6, "p", "0"), bulb("L1", "p", "0")),
    netlist(battery("B1", 5, "p", "0"), wire("W1", "p", "n1"),
            bulb("L1", "n1", "0")),
    netlist(battery("B1", 5, "p", "0"), switch("S1", True, "p", "n1"),
            bulb("L1", "n1", "0")),
    netlist(battery("B1", 5, "p", "0"), switch("S1", False, "p", "n1"),
            bulb("L1", "n1", "0")),
    netlist(battery("B1", 9, "p", "0"), bulb("L1", "p", "m"),
            bulb("L2", "m", "0"), wire("W1", "m", "0")),
    netlist(battery("B1", 6, "p", "m"), battery("B2", 6, "m", "0"),
            resistor("R1", 4, "p", "0")),
    netlist(battery("B1", 9, "p", "m"), battery("B2", 3, "0", "m"),
            resistor("R1", 3, "p", "0")),
]


@pytest.mark.parametrize("case", VALID_CASES)
def test_solution_obeys_kcl_kvl_and_power_balance(case):
    result = solve(copy.deepcopy(case))
    assert result.ok
    comps = {c["id"]: c for c in case["components"]}
    assert set(result.node_voltages) == {n for c in comps.values() for n in (c["a"], c["b"])}
    assert set(result.components) == set(comps)
    for node in result.node_voltages:
        leaving = sum(result.components[cid]["current"] * ((c["a"] == node) - (c["b"] == node))
                      for cid, c in comps.items())
        assert leaving == pytest.approx(0.0, abs=1e-9)
    assert sum(v["power"] for v in result.components.values()) == pytest.approx(0.0, abs=1e-9)
    for cid, comp in comps.items():
        want = result.node_voltages[comp["a"]] - result.node_voltages[comp["b"]]
        assert result.components[cid]["voltage"] == pytest.approx(want, abs=1e-9)


def test_same_input_gives_same_output():
    first = solve(copy.deepcopy(VALID_CASES[4]))
    second = solve(copy.deepcopy(VALID_CASES[4]))
    assert first.node_voltages == second.node_voltages
    assert first.components == second.components


def test_solver_does_not_mutate_the_netlist():
    for case in VALID_CASES:
        original = copy.deepcopy(case)
        solve(case)
        assert case == original


@pytest.mark.parametrize("case", [
    netlist(battery("B1", 10 ** 2000, "p", "0"), bulb("L1", "p", "0")),
    netlist(battery("B1", 6, "p", "0"),
            resistor("R1", 10 ** 2000, "p", "0")),
])
def test_huge_integer_values_are_rejected_without_raising(case):
    result = solve(case)
    assert result.ok is False
    assert result.error_code == INVALID_VALUE
    assert result.error_message


def test_non_finite_results_are_rejected_without_raising():
    result = solve(netlist(battery("B1", 1e308, "p", "0"),
                           resistor("R1", 1e-308, "p", "0")))
    assert result.ok is False
    assert result.error_code == INVALID_VALUE
