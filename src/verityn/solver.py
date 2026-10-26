"""Deterministic DC circuit solver: validate a netlist, then solve it.

Physics is owned by this module, never by a model (ARCHITECTURE principle 1):
a wrong number here would teach the wrong lesson, so the solution comes from
circuit laws, exactly and reproducibly.

Netlist format:
    {"components": [{"id": "B1", "type": "battery", "volts": 6,
                      "a": "p", "b": "0"}, ...]}
Component types: battery{volts}, resistor{ohms}, bulb{}, switch{closed: bool},
wire{}. Every component has a unique string id and two terminal nodes a and b.
For a battery, a is the + terminal and b is the - terminal.

Model (ideal, steady DC): wires and closed switches are 0 ohm; an open switch
carries 0 A; every bulb is the same fixed 10 ohm resistor (TEST_PLAN 3.3:
a 6 V battery across one bulb gives 0.6 A and 3.6 W).

Conventions: voltage = V(a) - V(b); current flows a -> b through the
component; power = voltage * current (absorbed). A battery delivering power
has negative current and negative power. Ground is the b terminal of the
first battery in the netlist.

`solve` never raises and never mutates its input. On success it returns node
voltages for every node and voltage/current/power for every component. On
rejection it returns an error code, a message naming an offending part when
there is one, and no numbers. Detection order (first match wins):
MALFORMED_NETLIST, INVALID_VALUE, EMPTY_CIRCUIT, NO_BATTERY,
DANGLING_TERMINAL (a loose end, i.e. the spec's "open circuit"),
FLOATING_COMPONENT (the first group in component order with no path to any
battery), SHORTED_BATTERY / CONFLICTING_SOURCES (a loop of only
zero-resistance parts), UNSOLVABLE (a valid-looking circuit whose equations
have no unique solution, e.g. parallel ideal shorts or nodes isolated by
open switches, detected as a singular system).

An open switch is valid (it carries 0 A); only unwired ends are errors. A bulb
with 0 V across it is valid; only a shorted battery is rejected.
"""

import math

MALFORMED_NETLIST = "MALFORMED_NETLIST"
INVALID_VALUE = "INVALID_VALUE"
EMPTY_CIRCUIT = "EMPTY_CIRCUIT"
NO_BATTERY = "NO_BATTERY"
DANGLING_TERMINAL = "DANGLING_TERMINAL"
FLOATING_COMPONENT = "FLOATING_COMPONENT"
SHORTED_BATTERY = "SHORTED_BATTERY"
CONFLICTING_SOURCES = "CONFLICTING_SOURCES"
UNSOLVABLE = "UNSOLVABLE"

BULB_OHMS = 10.0
TYPES = ("battery", "resistor", "bulb", "switch", "wire")


class SolveResult:
    """Outcome of `solve`: either numbers (ok) or an explained rejection."""

    def __init__(self, ok, node_voltages=None, components=None,
                 error_code=None, error_message="", component_ids=None):
        self.ok = ok
        self.node_voltages = node_voltages or {}
        self.components = components or {}
        self.error_code = error_code
        self.error_message = error_message
        self.component_ids = component_ids or []


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_finite_number(value):
    try:
        return math.isfinite(float(value))
    except OverflowError:
        return False


def _fail(code, message, ids):
    return SolveResult(ok=False, error_code=code, error_message=message,
                       component_ids=list(ids))


def _structural_error(comps):
    """Check envelope shape and per-item shape. Returns (code, ids, msg)."""
    if not isinstance(comps, list):
        return (MALFORMED_NETLIST, [],
                "A netlist needs a 'components' list.")
    seen = set()
    for item in comps:
        if not isinstance(item, dict):
            return (MALFORMED_NETLIST, [],
                    "Every component must be an object.")
        cid = item.get("id")
        if not isinstance(cid, str):
            return (MALFORMED_NETLIST, [],
                    "Every component needs a string id.")
        if cid in seen:
            return (MALFORMED_NETLIST, [cid],
                    f"Duplicate component id '{cid}'.")
        seen.add(cid)
        ctype = item.get("type")
        if ctype not in TYPES:
            return (MALFORMED_NETLIST, [cid],
                    f"Component '{cid}' has an unknown type.")
        if not isinstance(item.get("a"), str) or not isinstance(item.get("b"), str):
            return (MALFORMED_NETLIST, [cid],
                    f"Component '{cid}' needs two terminal nodes 'a' and 'b'.")
        if ctype == "battery" and not _is_number(item.get("volts")):
            return (MALFORMED_NETLIST, [cid],
                    f"Battery '{cid}' needs a numeric 'volts'.")
        if ctype == "resistor" and not _is_number(item.get("ohms")):
            return (MALFORMED_NETLIST, [cid],
                    f"Resistor '{cid}' needs a numeric 'ohms'.")
        if ctype == "switch" and not isinstance(item.get("closed"), bool):
            return (MALFORMED_NETLIST, [cid],
                    f"Switch '{cid}' needs a boolean 'closed'.")
    return None


def _bad_values(comps):
    bad = [c["id"] for c in comps
           if (c["type"] == "resistor"
               and (not _is_finite_number(c["ohms"]) or c["ohms"] <= 0))
           or (c["type"] == "battery"
               and (not _is_finite_number(c["volts"]) or c["volts"] <= 0))]
    if bad:
        return (INVALID_VALUE, bad,
                f"Values must be positive and finite: {', '.join(sorted(bad))}.")
    return None


class _UnionFind:
    def __init__(self):
        self.parent = {}

    def find(self, node):
        self.parent.setdefault(node, node)
        while self.parent[node] != node:
            self.parent[node] = self.parent[self.parent[node]]
            node = self.parent[node]
        return node

    def union(self, first, second):
        self.parent[self.find(first)] = self.find(second)


def _loose_ends(comps):
    touching = {}
    for comp in comps:
        for node in (comp["a"], comp["b"]):
            touching.setdefault(node, []).append(comp)
    loose = sorted({lst[0]["id"] for lst in touching.values() if len(lst) == 1})
    if loose:
        return (DANGLING_TERMINAL, loose,
                f"Open circuit: {', '.join(loose)} "
                f"{'has' if len(loose) == 1 else 'have'} a loose end.")
    return None


def _floating_group(comps):
    union = _UnionFind()
    for comp in comps:
        union.union(comp["a"], comp["b"])
    groups = {}
    for comp in comps:
        groups.setdefault(union.find(comp["a"]), []).append(comp)
    for members in groups.values():
        if not any(c["type"] == "battery" for c in members):
            ids = [c["id"] for c in members]
            return (FLOATING_COMPONENT, ids,
                    f"No path to a battery: {', '.join(ids)}.")
    return None


def _is_zero_resistance(comp):
    return comp["type"] in ("battery", "wire") or \
        (comp["type"] == "switch" and comp["closed"])


def _loop_through(taken, start, goal):
    """One path of already-placed zero-resistance branches, start to goal."""
    neighbours = {}
    for comp in taken:
        neighbours.setdefault(comp["a"], []).append((comp["b"], comp))
        neighbours.setdefault(comp["b"], []).append((comp["a"], comp))
    previous = {start: None}
    queue = [start]
    while queue:
        node = queue.pop(0)
        if node == goal:
            break
        for other, comp in neighbours.get(node, []):
            if other not in previous:
                previous[other] = (node, comp)
                queue.append(other)
    path, node = [], goal
    while previous.get(node) is not None:
        node, comp = previous[node][0], previous[node][1]
        path.append(comp)
    return path


def _shorted_loop(comps):
    union = _UnionFind()
    taken = []
    for comp in comps:
        if not _is_zero_resistance(comp):
            continue
        if union.find(comp["a"]) == union.find(comp["b"]):
            loop = _loop_through(taken, comp["a"], comp["b"]) + [comp]
            batteries = [c["id"] for c in loop if c["type"] == "battery"]
            if len(batteries) == 1:
                ids = [c["id"] for c in loop]
                others = [i for i in ids if i != batteries[0]]
                if others:
                    message = (f"Battery {batteries[0]} is shorted by "
                               f"{', '.join(others)}.")
                else:
                    message = (f"Battery {batteries[0]} has both terminals "
                               f"on the same node.")
                return (SHORTED_BATTERY, ids, message)
            if len(batteries) >= 2:
                return (CONFLICTING_SOURCES, batteries,
                        f"Batteries {', '.join(batteries)} are joined "
                        f"with no load between them.")
            continue
        union.union(comp["a"], comp["b"])
        taken.append(comp)
    return None


def validate(netlist):
    """Return None when solvable, else (error_code, component_ids, message)."""
    comps = netlist.get("components") if isinstance(netlist, dict) else None
    structural = _structural_error(comps)
    if structural is not None:
        return structural
    values = _bad_values(comps)
    if values is not None:
        return values
    if not comps:
        return (EMPTY_CIRCUIT, [], "The canvas is empty: add a battery.")
    if not any(c["type"] == "battery" for c in comps):
        return (NO_BATTERY, [], "There is no battery in this circuit.")
    for check in (_loose_ends, _floating_group, _shorted_loop):
        found = check(comps)
        if found is not None:
            return found
    return None


def _resistance(comp):
    if comp["type"] == "resistor":
        return float(comp["ohms"])
    if comp["type"] == "bulb":
        return BULB_OHMS
    return None


def _solve_linear(matrix, rhs):
    """Gauss-Jordan with partial pivoting. None when exactly singular."""
    size = len(rhs)
    work = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]
    for col in range(size):
        pivot = max(range(col, size), key=lambda r: abs(work[r][col]))
        if work[pivot][col] == 0.0:
            return None
        work[col], work[pivot] = work[pivot], work[col]
        scale = work[col][col]
        work[col] = [value / scale for value in work[col]]
        for row in range(size):
            if row != col and work[row][col] != 0.0:
                factor = work[row][col]
                work[row] = [x - factor * y for x, y in zip(work[row], work[col])]
    return [work[i][size] for i in range(size)]


def _nodal_analysis(comps):
    """Modified nodal analysis. Returns (node volts, source currents)."""
    nodes = []
    for comp in comps:
        for node in (comp["a"], comp["b"]):
            if node not in nodes:
                nodes.append(node)
    ground = next(c["b"] for c in comps if c["type"] == "battery")
    index = {node: i for i, node in enumerate(n for n in nodes if n != ground)}
    sources = [c for c in comps if _is_zero_resistance(c)]
    count, extra = len(index), len(sources)
    size = count + extra
    matrix = [[0.0] * size for _ in range(size)]
    rhs = [0.0] * size
    for comp in comps:
        ohms = _resistance(comp)
        if ohms is None:
            continue
        conductance = 1.0 / ohms
        first, second = comp["a"], comp["b"]
        if first != ground:
            matrix[index[first]][index[first]] += conductance
            if second != ground:
                matrix[index[first]][index[second]] -= conductance
        if second != ground:
            matrix[index[second]][index[second]] += conductance
            if first != ground:
                matrix[index[second]][index[first]] -= conductance
    for pos, comp in enumerate(sources):
        col = count + pos
        volts = float(comp["volts"]) if comp["type"] == "battery" else 0.0
        if comp["a"] != ground:
            matrix[index[comp["a"]]][col] += 1.0
            matrix[col][index[comp["a"]]] += 1.0
        if comp["b"] != ground:
            matrix[index[comp["b"]]][col] -= 1.0
            matrix[col][index[comp["b"]]] -= 1.0
        rhs[col] = volts
    solution = _solve_linear(matrix, rhs)
    if solution is None:
        return None
    volts = {node: (0.0 if node == ground else solution[index[node]])
             for node in nodes}
    currents = {comp["id"]: solution[count + pos]
                for pos, comp in enumerate(sources)}
    return volts, currents


def solve(netlist):
    """Validate then solve. Never raises, never mutates the input."""
    rejected = validate(netlist)
    if rejected is not None:
        code, ids, message = rejected
        return _fail(code, message, ids)
    comps = netlist["components"]
    analysed = _nodal_analysis(comps)
    if analysed is None:
        return _fail(UNSOLVABLE,
                     "The circuit equations have no unique solution.", [])
    volts, currents = analysed
    if not all(math.isfinite(value) for value in volts.values()):
        return _fail(INVALID_VALUE,
                     "Values produce non-finite node voltages.",
                     [comp["id"] for comp in comps])
    out = {}
    for comp in comps:
        ctype = comp["type"]
        if ctype in ("resistor", "bulb"):
            voltage = volts[comp["a"]] - volts[comp["b"]]
            current = voltage / _resistance(comp)
        elif ctype == "switch" and not comp["closed"]:
            voltage = volts[comp["a"]] - volts[comp["b"]]
            current = 0.0
        else:
            voltage = float(comp["volts"]) if ctype == "battery" else 0.0
            current = currents[comp["id"]]
        if not all(math.isfinite(value) for value in (voltage, current,
                                                       voltage * current)):
            return _fail(INVALID_VALUE,
                         "Values produce non-finite circuit results.",
                         [comp["id"]])
        out[comp["id"]] = {"voltage": voltage, "current": current,
                           "power": voltage * current}
    return SolveResult(ok=True, node_voltages=volts, components=out)
