"""Deterministic prediction evaluator: judge a claim against solver output.

Verdicts are owned by this module, never by a model (ARCHITECTURE
principle 1): a claim is checked against the numbers the solver produced,
with no interpretation and no scoring. A verdict says whether the claim
matches the circuit model; it never says anything about the learner, and
one consistent prediction proves nothing about understanding.

Call: evaluate(claim, netlist, result) -> Verdict(status, reason, evidence).
Statuses map to the UI labels one to one: CONSISTENT is "Consistent with
the model", CONTRADICTED is "Contradicted by the model", UNASSESSABLE is
"Can't assess".

V1 claims (anything else is MALFORMED_CLAIM):
    {"type": "lit", "component": "L1", "value": True}
    {"type": "compare_brightness", "a": "LA", "b": "LB",
     "relation": "brighter" | "dimmer" | "equal"}

Brightness within the circuit model is bulb power in watts. Two powers
within 1% of the larger magnitude count as equal; two zero values count
as equal. Powers at or below 1e-9 W count as zero (floating-point noise).
`lit` means power above that floor. Evidence keys look like "L1.power_W"
and carry model values only.

Reasons fall in two disjoint sets. When the solver result is unsuccessful
the verdict is UNASSESSABLE with the solver's own error code, checked
before the claim, so a broken circuit is never mislabelled as a learner
error. Claim-side reasons are MALFORMED_CLAIM (bad shape, unknown type,
or wrong field kinds), UNKNOWN_COMPONENT (an id missing from the netlist
or the solution), INVALID_TARGET (a lit or brightness claim about a part
that is not a bulb), and SOLVER_FAILED (a defensive fallback used only
when the result itself is missing or carries no error code).

`evaluate` is pure: it never raises, never mutates its inputs, and calls
no model and no network. This module has no imports at all.
"""

CONSISTENT = "CONSISTENT"
CONTRADICTED = "CONTRADICTED"
UNASSESSABLE = "UNASSESSABLE"

MALFORMED_CLAIM = "MALFORMED_CLAIM"
UNKNOWN_COMPONENT = "UNKNOWN_COMPONENT"
INVALID_TARGET = "INVALID_TARGET"
SOLVER_FAILED = "SOLVER_FAILED"

CLAIM_REASONS = frozenset({MALFORMED_CLAIM, UNKNOWN_COMPONENT,
                           INVALID_TARGET, SOLVER_FAILED})

REL_TOLERANCE = 0.01
ZERO_POWER = 1e-9


class Verdict:
    """Outcome of `evaluate`: a status, a reason, and deciding numbers."""

    def __init__(self, status, reason=None, evidence=None):
        self.status = status
        self.reason = reason
        self.evidence = dict(evidence) if evidence else {}


def _unassessable(reason):
    return Verdict(UNASSESSABLE, reason, {})


def _component_types(netlist):
    if not isinstance(netlist, dict):
        return {}
    comps = netlist.get("components")
    if not isinstance(comps, list):
        return {}
    types = {}
    for comp in comps:
        if isinstance(comp, dict) and isinstance(comp.get("id"), str):
            types[comp["id"]] = comp.get("type")
    return types


def _is_usable_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _solution_powers(result):
    comps = getattr(result, "components", None)
    if not isinstance(comps, dict):
        return {}
    powers = {}
    for cid, vals in comps.items():
        if isinstance(vals, dict) and _is_usable_number(vals.get("power")):
            powers[cid] = vals["power"]
    return powers


def _bulb_power(cid, types, powers):
    if cid not in types or cid not in powers:
        return None, UNKNOWN_COMPONENT
    if types[cid] != "bulb":
        return None, INVALID_TARGET
    return powers[cid], None


def _brightness_relation(first, second):
    if abs(first) <= ZERO_POWER and abs(second) <= ZERO_POWER:
        return "equal"
    largest = max(abs(first), abs(second))
    if abs(first - second) <= REL_TOLERANCE * largest:
        return "equal"
    return "brighter" if first > second else "dimmer"


def evaluate(claim, netlist, result):
    """Judge a claim against a solver result. Never raises, never mutates."""
    if getattr(result, "ok", False) is not True:
        code = getattr(result, "error_code", None)
        reason = code if isinstance(code, str) and code else SOLVER_FAILED
        return _unassessable(reason)
    if not isinstance(claim, dict):
        return _unassessable(MALFORMED_CLAIM)
    ctype = claim.get("type")
    types = _component_types(netlist)
    powers = _solution_powers(result)
    if ctype == "lit":
        cid = claim.get("component")
        value = claim.get("value")
        if not isinstance(cid, str) or not isinstance(value, bool):
            return _unassessable(MALFORMED_CLAIM)
        power, error = _bulb_power(cid, types, powers)
        if error is not None:
            return _unassessable(error)
        actual = power > ZERO_POWER
        status = CONSISTENT if actual == value else CONTRADICTED
        return Verdict(status, None, {f"{cid}.power_W": power})
    if ctype == "compare_brightness":
        first = claim.get("a")
        second = claim.get("b")
        relation = claim.get("relation")
        if (not isinstance(first, str) or not isinstance(second, str)
                or relation not in ("brighter", "dimmer", "equal")):
            return _unassessable(MALFORMED_CLAIM)
        first_power, error = _bulb_power(first, types, powers)
        if error is not None:
            return _unassessable(error)
        second_power, error = _bulb_power(second, types, powers)
        if error is not None:
            return _unassessable(error)
        actual = _brightness_relation(first_power, second_power)
        status = CONSISTENT if actual == relation else CONTRADICTED
        evidence = {f"{first}.power_W": first_power,
                    f"{second}.power_W": second_power}
        return Verdict(status, None, evidence)
    return _unassessable(MALFORMED_CLAIM)
