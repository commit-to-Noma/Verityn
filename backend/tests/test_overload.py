"""Overload physics: ratings, assessment, and damaged-bulb behavior.

The solver measures first and assesses from the same numbers. Ratings
and conditions are optional inputs; assessment is additive output.
Existing unrated circuits keep their exact measurements.
"""

import copy
import math

import pytest

from verityn import solver

LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "S1", "type": "switch", "closed": True, "a": "p", "b": "m"},
    {"id": "L1", "type": "bulb", "a": "m", "b": "0"},
]}

TWO_BATTERIES = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "q"},
    {"id": "B2", "type": "battery", "volts": 6, "a": "q", "b": "0"},
    {"id": "L1", "type": "bulb", "a": "p", "b": "0"},
]}


def close(a, b):
    return abs(a - b) < 1e-9


def test_default_bulb_keeps_classic_numbers_and_reports_intact():
    result = solver.solve(LOOP)
    assert result.ok is True
    assert close(result.components["L1"]["current"], 0.6)
    assert close(result.components["L1"]["power"], 3.6)
    assert result.conditions == {"L1": "intact"}
    assert result.ratings == {"L1": {"rated_volts": 6.0,
                                    "max_safe_watts": 6.0}}


def test_assessment_is_deterministic():
    first = solver.solve(TWO_BATTERIES)
    second = solver.solve(TWO_BATTERIES)
    assert first.conditions == second.conditions == {"L1": "overloaded"}
    assert first.components == second.components


def test_two_batteries_series_measure_and_overload():
    result = solver.solve(TWO_BATTERIES)
    assert result.ok is True
    assert result.error_code is None
    assert close(result.components["L1"]["voltage"], 12.0)
    assert close(result.components["L1"]["current"], 1.2)
    assert close(result.components["L1"]["power"], 14.4)
    assert result.conditions == {"L1": "overloaded"}


def test_overload_is_a_warning_not_a_rejection():
    result = solver.solve(TWO_BATTERIES)
    assert result.ok is True
    assert result.error_code is None
    assert result.conditions["L1"] == "overloaded"


def test_overvoltage_alone_triggers():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["rated_volts"] = 3
    loop["components"][2]["max_safe_watts"] = 100
    result = solver.solve(loop)
    assert result.ok is True
    assert result.conditions == {"L1": "overloaded"}
    assert result.ratings["L1"] == {"rated_volts": 3.0,
                                    "max_safe_watts": 100.0}


def test_overpower_alone_triggers():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["rated_volts"] = 12
    loop["components"][2]["max_safe_watts"] = 1
    result = solver.solve(loop)
    assert result.conditions == {"L1": "overloaded"}


def test_exactly_at_rating_stays_intact():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["rated_volts"] = 6
    loop["components"][2]["max_safe_watts"] = 3.6
    result = solver.solve(loop)
    assert result.conditions == {"L1": "intact"}


def test_rated_bulb_keeps_measurements():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["rated_volts"] = 12
    loop["components"][2]["max_safe_watts"] = 20
    result = solver.solve(loop)
    assert close(result.components["L1"]["current"], 0.6)
    assert close(result.components["L1"]["power"], 3.6)
    assert result.conditions == {"L1": "intact"}


def test_damaged_bulb_is_open_but_stays_wired():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["condition"] = "damaged"
    result = solver.solve(loop)
    assert result.ok is True
    assert result.components["L1"]["current"] == 0.0
    assert result.components["L1"]["power"] == 0.0
    assert result.conditions == {"L1": "damaged"}


def test_damaged_bulb_is_deterministic():
    loop = copy.deepcopy(TWO_BATTERIES)
    loop["components"][2]["condition"] = "damaged"
    first = solver.solve(loop)
    second = solver.solve(loop)
    assert first.components == second.components
    assert first.conditions == {"L1": "damaged"}
    assert first.components["L1"]["current"] == 0.0


def test_damaged_bulb_voltage_is_still_reported():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["condition"] = "damaged"
    result = solver.solve(loop)
    assert close(result.components["L1"]["voltage"], 6.0)


def test_open_switch_never_overloads():
    loop = copy.deepcopy(LOOP)
    loop["components"][1]["closed"] = False
    result = solver.solve(loop)
    assert result.ok is True
    assert result.conditions == {"L1": "intact"}


def test_damaged_bulb_does_not_short_or_dangle():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["condition"] = "damaged"
    result = solver.solve(loop)
    assert result.error_code is None


@pytest.mark.parametrize("field,value", [
    ("rated_volts", 0),
    ("rated_volts", -6),
    ("rated_volts", float("inf")),
    ("rated_volts", float("nan")),
    ("rated_volts", "six"),
    ("max_safe_watts", 0),
    ("max_safe_watts", -1),
    ("max_safe_watts", float("inf")),
    ("max_safe_watts", float("nan")),
    ("max_safe_watts", None),
])
def test_bad_ratings_rejected(field, value):
    loop = copy.deepcopy(LOOP)
    loop["components"][2][field] = value
    result = solver.solve(loop)
    assert result.ok is False
    assert result.error_code in ("MALFORMED_NETLIST", "INVALID_VALUE")
    assert result.conditions == {}
    assert "L1" in result.component_ids


@pytest.mark.parametrize("condition", ["burning", "overloaded", "", None, 7])
def test_unknown_input_condition_rejected(condition):
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["condition"] = condition
    result = solver.solve(loop)
    assert result.ok is False
    assert result.error_code == "MALFORMED_NETLIST"


def test_explicit_intact_behaves_like_default():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["condition"] = "intact"
    result = solver.solve(loop)
    assert result.conditions == {"L1": "intact"}
    assert close(result.components["L1"]["power"], 3.6)


def test_shorted_battery_still_rejected_with_ratings_present():
    shorted = {"components": [
        {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
        {"id": "L1", "type": "bulb", "a": "p", "b": "m",
         "rated_volts": 6, "max_safe_watts": 6},
        {"id": "W1", "type": "wire", "a": "p", "b": "0"},
        {"id": "W2", "type": "wire", "a": "m", "b": "0"},
    ]}
    result = solver.solve(shorted)
    assert result.ok is False
    assert result.error_code == "SHORTED_BATTERY"
    assert result.conditions == {}


def test_rejection_carries_no_conditions_or_ratings():
    result = solver.solve({"components": []})
    assert result.ok is False
    assert result.conditions == {}
    assert result.ratings == {}


def test_solver_never_mutates_ratings_input():
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["rated_volts"] = 12
    loop["components"][2]["condition"] = "intact"
    frozen = copy.deepcopy(loop)
    solver.solve(loop)
    solver.solve(loop)
    assert loop == frozen


def test_lesson_circuits_measure_identically_and_stay_intact():
    twist_open = copy.deepcopy(LOOP)
    twist_open["components"][1]["closed"] = False
    transfer = {"components": [
        {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
        {"id": "S1", "type": "switch", "closed": True, "a": "p", "b": "m"},
        {"id": "L1", "type": "bulb", "a": "m", "b": "0"},
        {"id": "L2", "type": "bulb", "a": "m", "b": "0"},
    ]}
    fixed = solver.solve(LOOP)
    assert close(fixed.components["L1"]["current"], 0.6)
    assert close(fixed.components["L1"]["power"], 3.6)
    assert fixed.conditions == {"L1": "intact"}
    opened = solver.solve(twist_open)
    assert opened.components["L1"]["power"] == 0.0
    assert opened.conditions == {"L1": "intact"}
    solo = solver.solve(transfer)
    assert close(solo.components["L1"]["power"], 3.6)
    assert close(solo.components["L2"]["power"], 3.6)
    assert solo.conditions == {"L1": "intact", "L2": "intact"}


def test_infinite_rating_is_not_finite():
    assert not math.isfinite(float("inf"))
    loop = copy.deepcopy(LOOP)
    loop["components"][2]["max_safe_watts"] = 1e308 * 10
    result = solver.solve(loop)
    assert result.ok is False
