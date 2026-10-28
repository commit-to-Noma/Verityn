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
