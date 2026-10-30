"""Prototype coaching provider (M8): fixed templates, keyword routing.

Deterministic template routing -- not AI diagnosis. No model is
called. A real provider replaces this class in M10 behind the
CoachProvider contract in coach.py.

Every response is a guiding question. When the Twist's parts are
present in the solver facts and the bulb is dark, the question cites
those already-visible measurements (battery volts, bulb amps and
watts) and asks which component breaks the loop; it never names the
answer, states the outcome, or gives wiring instructions. The tests
enforce that, and keyword-routed templates stay digit-free as the
fallback path.
"""

import math

from verityn.coach import CoachProviderError

TEMPLATES = {
    "yes": {
        "default": "What has to be true about the loop for the bulb to light?",
        "switch": "The switch is open. What does that change about the loop?",
        "gap": ("The gap is closed. What else in the loop decides "
                "whether the bulb lights?"),
    },
    "no": {
        "default": "What in this loop are you least sure about?",
        "switch": "The switch is open. What does that change about the loop?",
        "gap": ("The gap is closed. What else in the loop decides "
                "whether the bulb lights?"),
    },
}

ALL_TEXTS = tuple(text for pool in TEMPLATES.values()
                  for text in pool.values())

SWITCH_WORDS = ("switch",)
GAP_WORDS = ("wire", "gap", "connect", "join")


def route_template(choice, why):
    """Pick a fixed template from the recorded choice and Why text."""
    pool = TEMPLATES[choice]
    text = why.strip().lower()
    if any(word in text for word in SWITCH_WORDS):
        return pool["switch"]
    if any(word in text for word in GAP_WORDS):
        return pool["gap"]
    return pool["default"]


#: Bulb power at or below this floor reads as dark (matches the solver).
DARK_POWER_W = 1e-9


def grounded_question(facts):
    """Cite the Twist's solver facts in one guiding question.

    Applies only to a dark bulb: the loop-blocked question would be
    nonsense for a lit circuit. Returns None unless the facts carry
    finite numbers for the battery voltage and the bulb current and
    power, so lit, renamed, or partial submissions fall back to
    keyword-routed templates.
    """
    if not isinstance(facts, dict):
        return None
    volts = facts.get("B1.voltage_V")
    amps = facts.get("L1.current_A")
    watts = facts.get("L1.power_W")
    numbers = (volts, amps, watts)
    if not all(isinstance(value, (int, float)) and math.isfinite(value)
               for value in numbers):
        return None
    if watts > DARK_POWER_W:
        return None
    return (f"The battery still holds {volts:.1f} V, yet L1 reads "
            f"{amps:.1f} A and {watts:.1f} W. Which component prevents "
            "charge from making a complete loop?")


#: Experiment explanations for rejected circuits, keyed by solver code.
EXPLAIN_INVALID = {
    "EMPTY_CIRCUIT": ("There is nothing to measure yet — place a battery, "
                      "a bulb, and wires, then run again."),
    "NO_BATTERY": ("No battery is connected, so no current can flow. "
                   "Add a battery and run again."),
    "DANGLING_TERMINAL": ("Some terminals are loose, so the loop is "
                          "incomplete. Connect every open terminal and run "
                          "again."),
    "FLOATING_COMPONENT": ("A part is not wired into the loop. Connect "
                           "every component, then run again."),
    "SHORTED_BATTERY": ("A wire connects the battery straight back to "
                        "itself. Give the current a path through a bulb "
                        "instead."),
    "CONFLICTING_SOURCES": ("Two batteries fight each other, so the circuit "
                            "cannot settle. Use one battery at a time."),
    "MALFORMED_NETLIST": ("This drawing is unreadable to the simulator. "
                          "Rebuild it step by step."),
    "INVALID_VALUE": ("One of the part values is unusable. Check the "
                      "battery voltage."),
    "UNSOLVABLE": ("The simulator cannot settle this circuit. Simplify "
                   "the wiring and try again."),
}


def _finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def explain_experiment(*, facts, valid, error_code, switches, bulbs):
    """Deterministic experiment explanation from server-side facts only.

    Numbers come from the solver facts; invalid circuits get the
    code-owned hint; the closing suggestion names only parts that
    exist. Never calls a model.
    """
    if not valid:
        return EXPLAIN_INVALID.get(
            error_code,
            "The simulator could not test this circuit. Fix the wiring "
            "and run again.")
    lit = [bid for bid in bulbs
           if _finite((facts or {}).get(f"{bid}.power_W"))
           and facts[f"{bid}.power_W"] > DARK_POWER_W]
    if not lit:
        first = bulbs[0] if bulbs else "L1"
        amps = (facts or {}).get(f"{first}.current_A", 0.0)
        watts = (facts or {}).get(f"{first}.power_W", 0.0)
        amps = amps if _finite(amps) else 0.0
        watts = watts if _finite(watts) else 0.0
        return (f"The loop is complete but no bulb lit: {first} reads "
                f"{amps:.1f} A and {watts:.1f} W. Is a switch open, or "
                "is a terminal loose?")
    if len(lit) == 1:
        bid = lit[0]
        amps = facts.get(f"{bid}.current_A", 0.0)
        watts = facts.get(f"{bid}.power_W", 0.0)
        amps = amps if _finite(amps) else 0.0
        watts = watts if _finite(watts) else 0.0
        outcome = (f"{bid} lit: {amps:.1f} A and {watts:.1f} W. Current "
                   "has a complete path from the battery through the bulb.")
    else:
        outcome = (f"{len(lit)} bulbs lit ({', '.join(lit)}). Current "
                   "reaches every lit bulb through a complete path.")
    closed = [sid for sid, state in (switches or {}).items() if state]
    if closed:
        suggestion = (f"Try opening {closed[0]} and running again — what "
                      "happens to the current?")
    elif switches:
        suggestion = (f"Try closing {sorted(switches)[0]} and running "
                      "again — what happens to the current?")
    else:
        suggestion = ("Try adding a switch to the loop and running it "
                      "open and closed.")
    return f"{outcome} {suggestion}"


class FakeCoachProvider:
    """Fixed-template provider. fail=True forces an outage (tests only)."""

    name = "prototype-fake"

    def __init__(self, fail=False):
        self.fail = fail

    def r1_question(self, *, choice, why, facts=None):
        if self.fail:
            raise CoachProviderError("Fake provider forced failure.",
                                     stage="transport")
        grounded = grounded_question(facts)
        if grounded is not None:
            return grounded
        return route_template(choice, why)

    def explain(self, *, facts, valid, error_code, component_ids,
                switches, bulbs):
        if self.fail:
            raise CoachProviderError("Fake provider forced failure.",
                                     stage="transport")
        return explain_experiment(facts=facts, valid=valid,
                                  error_code=error_code, switches=switches,
                                  bulbs=bulbs)
