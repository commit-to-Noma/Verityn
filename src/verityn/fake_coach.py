"""Prototype coaching provider (M8): fixed templates, keyword routing.

Deterministic template routing -- not AI diagnosis. No model is
called and no numbers are computed here. A real provider replaces
this class in M10 behind the CoachProvider contract in coach.py.

Every template is a guiding question. None states the outcome, gives
numbers, or gives wiring instructions; the tests enforce that.
"""

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


class FakeCoachProvider:
    """Fixed-template provider. fail=True forces an outage (tests only)."""

    name = "prototype-fake"

    def __init__(self, fail=False):
        self.fail = fail

    def r1_question(self, *, choice, why):
        if self.fail:
            raise CoachProviderError("Fake provider forced failure.")
        return route_template(choice, why)
