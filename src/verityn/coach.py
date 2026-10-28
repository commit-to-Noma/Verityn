"""Server-side coaching sessions and eligibility (M8).

Trust boundary: the server records predictions itself and re-derives
every verdict at ask-time with the deterministic solver and evaluator.
It never accepts a client-provided verdict or claim. Rung requests
(R1/R2/R4) advance only through server-recorded order: R2 needs a
served R1, R4 needs a served R2, and every rung re-judges the
submitted circuit itself.

Guarantee, stated precisely: the server verifies the submitted
circuit's outcome; it does not prove the learner built it in the
canvas.

Sessions live in memory only: a restart clears them, and the design
assumes a single backend process. Each Flask app instance owns its
store, so tests stay isolated.
"""

import json
import logging
import math
import re
import secrets
from pathlib import Path
from typing import Protocol

from verityn import evaluator, solver

log = logging.getLogger(__name__)

LESSON_PATH = Path(__file__).resolve().parent / "lessons" / "l1.json"

CHOICES = ("yes", "no", "not_sure")
WHY_MAX_CHARS = 500

UNKNOWN_SESSION = "UNKNOWN_SESSION"
RUNG_OUT_OF_ORDER = "RUNG_OUT_OF_ORDER"
NO_TWIST_PREDICTION = "NO_TWIST_PREDICTION"
NOT_DEFINITE = "NOT_DEFINITE"
NOT_SOLVED = "NOT_SOLVED"
NOT_ASSESSABLE = "NOT_ASSESSABLE"
NOT_CONTRADICTED = "NOT_CONTRADICTED"

#: Ladder rungs served by /api/coach/ask, in required order.
VALID_RUNGS = ("R1", "R2", "R4")
#: Provider value for deterministic rungs (built from solver facts,
#: never model output).
DETERMINISTIC_PROVIDER = "deterministic"


class CoachValidationError(ValueError):
    """A coach request that fails validation (maps to HTTP 400)."""


class CoachProviderError(RuntimeError):
    """The coaching provider failed (maps to HTTP 500, never leaks).

    Carries only controlled fields: stage is a fixed category,
    http_status an int or None, shape an allowlisted structural sketch
    or None, reason a fixed rule code or None. Logs and responses must
    use these fields, never the message, which callers could fill
    arbitrarily.
    """

    def __init__(self, message, *, stage, http_status=None, shape=None,
                 reason=None):
        super().__init__(message)
        self.stage = stage
        self.http_status = http_status
        self.shape = shape
        self.reason = reason


LEAK_PHRASES = ("dark", "lit", "won't", "will not", "does not light",
                "doesn't light", "stays", "no current", "current", "power",
                "volt", "ampere", "connect", "wire", "join", "attach",
                "between", "add a", "should", "must", "open it", "close it",
                "answer", "because")

_QUOTE_TABLE = str.maketrans({"\u2019": "'", "\u201c": '"', "\u201d": '"'})


def _leak_pattern(phrase):
    if " " in phrase:
        return re.compile(r"\b" + re.escape(phrase) + r"\b")
    return re.compile(r"\b" + re.escape(phrase) + r"[a-z]*")


_LEAK_PATTERNS = tuple((_leak_pattern(phrase), phrase)
                       for phrase in LEAK_PHRASES)


def find_leak(text):
    """Return the first leak phrase in text, or None.

    Case-insensitive. Single words match at a word start so inflections
    ("darkness", "wired") still match while innocent words ("split")
    do not. Curly quotes are normalized first.
    """
    lowered = text.translate(_QUOTE_TABLE).lower()
    for pattern, phrase in _LEAK_PATTERNS:
        if pattern.search(lowered):
            return phrase
    return None


class CoachProvider(Protocol):
    """Narrow provider contract: one rung, one question.

    M8 ships the fake implementation; M9a adds the real one behind the
    same contract. The eligibility logic below does not change.
    """

    name: str

    def r1_question(self, *, choice: str, why: str,
                    facts: dict | None = None) -> str:
        """Return an R1 guiding question for a definite prediction.

        facts carries solver numbers for output validation; providers
        that need none may ignore it.
        """
        ...


def load_pack(pack=None):
    """Return the lesson pack, or the injected one (tests only)."""
    if pack is not None:
        return pack
    return json.loads(LESSON_PATH.read_text())


def twist_id(pack):
    return pack["twist"]["id"]


def known_challenge_ids(pack):
    return frozenset({pack["id"], pack["twist"]["id"]})


def twist_claim_spec(pack):
    return pack["twist"]["claim"]


class SessionStore:
    """In-memory prediction records, one store per app instance."""

    def __init__(self):
        self.sessions = {}

    def create_session(self):
        session_id = secrets.token_urlsafe(16)
        self.sessions[session_id] = {"predictions": {}}
        return session_id

    def record_prediction(self, challenge_id, choice, why,
                          session_id=None, pack=None):
        """Store a prediction, minting a session when needed.

        An unknown session id mints a fresh session: ids are
        unguessable, and a restart wipes the store anyway, so there is
        nothing to protect by refusing. Why is stored verbatim;
        matching for template routing strips it at selection time.
        """
        pack = load_pack(pack)
        if (not isinstance(challenge_id, str)
                or challenge_id not in known_challenge_ids(pack)):
            raise CoachValidationError(
                f"Unknown challenge: {challenge_id!r}.")
        if choice not in CHOICES:
            raise CoachValidationError(f"Invalid choice: {choice!r}.")
        if not isinstance(why, str):
            raise CoachValidationError("Why must be a string.")
        if len(why) > WHY_MAX_CHARS:
            raise CoachValidationError("Why is too long.")
        if session_id is not None and not isinstance(session_id, str):
            raise CoachValidationError("Session id must be a string.")
        if not isinstance(session_id, str) or session_id not in self.sessions:
            session_id = self.create_session()
        self.sessions[session_id]["predictions"][challenge_id] = {
            "choice": choice,
            "why": why,
        }
        return session_id

    def get_prediction(self, session_id, challenge_id):
        try:
            return self.sessions[session_id]["predictions"][challenge_id]
        except KeyError:
            return None


def build_twist_claim(choice, claim_spec):
    """Rebuild the judged claim from the STORED choice. Never trusts input."""
    if claim_spec.get("type") != "lit":
        return None
    component = claim_spec.get("component")
    if not isinstance(component, str):
        return None
    if choice == "not_sure":
        return None
    return {"type": "lit", "component": component,
            "value": choice == "yes"}


def _refused(reason_code, message):
    return {"eligible": False, "reason_code": reason_code,
            "message": message}


def solver_facts(result):
    """Flatten a solved result into per-part solver numbers."""
    facts = {}
    for cid, measurement in result.components.items():
        facts[f"{cid}.power_W"] = measurement["power"]
        facts[f"{cid}.current_A"] = measurement["current"]
        facts[f"{cid}.voltage_V"] = measurement["voltage"]
    return facts


def _is_number(value):
    return (isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value))


def _bulb_numbers(facts, component):
    """Validated (amps, watts) for one part, or None when unusable."""
    if not isinstance(facts, dict) or not isinstance(component, str):
        return None
    amps = facts.get(f"{component}.current_A")
    watts = facts.get(f"{component}.power_W")
    if not _is_number(amps) or not _is_number(watts):
        return None
    return amps, watts


def _open_switches(netlist):
    """Ids of explicitly open switches in a submitted netlist."""
    if not isinstance(netlist, dict):
        return []
    components = netlist.get("components")
    if not isinstance(components, list):
        return []
    found = []
    for part in components:
        if (isinstance(part, dict) and part.get("type") == "switch"
                and part.get("closed") is False
                and isinstance(part.get("id"), str)):
            found.append(part["id"])
    return found


def r2_pointer(*, claim_component, facts, netlist):
    """Deterministic R2 evidence pointer from solver state.

    Names the measured bulb numbers and, when the bulb is dark
    behind open switches, the break in the loop. Pure template over
    server facts: no model call, nothing invented.
    """
    numbers = _bulb_numbers(facts, claim_component)
    if numbers is None:
        return ("Evidence: the submitted circuit contradicts the "
                "recorded prediction.")
    amps, watts = numbers
    if watts > evaluator.ZERO_POWER:
        return (f"Evidence: {claim_component} reads {amps:.1f} A and "
                f"{watts:.1f} W — the loop is complete.")
    switches = _open_switches(netlist)
    if not switches:
        return (f"Evidence: {claim_component} reads {amps:.1f} A and "
                f"{watts:.1f} W.")
    if len(switches) == 1:
        through = facts.get(f"{switches[0]}.current_A")
        if _is_number(through):
            clause = (f"{switches[0]} is open with {through:.1f} A "
                      f"through it")
        else:
            clause = f"{switches[0]} is open"
    else:
        clause = f"{' and '.join(switches)} are open"
    return (f"Evidence: {claim_component} reads {amps:.1f} A and "
            f"{watts:.1f} W. {clause} — no complete loop, so no "
            f"current reaches {claim_component}.")


def r4_prompt(*, claim_component, facts, netlist):
    """Deterministic R4 confirmation check before solo transfer.

    Asks the learner to state the reason in their own words against
    the same evidence R2 pointed at. The reply is recorded, never
    graded: articulation is the check, not a score.
    """
    numbers = _bulb_numbers(facts, claim_component)
    if numbers is None:
        return ("Confirmation check: in your own words, why did the "
                "circuit disagree with your prediction?")
    amps, watts = numbers
    if watts > evaluator.ZERO_POWER:
        return (f"Confirmation check — in your own words, why does "
                f"{claim_component} light? The evidence says the loop "
                f"is complete at {amps:.1f} A.")
    switches = _open_switches(netlist)
    if switches:
        through = facts.get(f"{switches[0]}.current_A")
        if _is_number(through):
            evidence = (f"{switches[0]} is open with {through:.1f} A")
        else:
            evidence = f"{switches[0]} is open"
    else:
        evidence = (f"{claim_component} reads {amps:.1f} A and "
                    f"{watts:.1f} W")
    return (f"Confirmation check — in your own words, why does "
            f"{claim_component} stay dark? The evidence says {evidence}.")


def derive_eligibility(store, session_id, netlist, provider, pack=None,
                       fallback=None, rung="R1"):
    """Decide coaching eligibility from server-side records and evidence.

    R1 asks the provider (with fallback) after a server-computed
    CONTRADICTED verdict. R2 and R4 are deterministic templates over
    the same server facts: the provider is never called for them.
    Rungs advance only through server-recorded order, and every rung
    re-judges the submitted circuit itself. Every refusal path leaves
    the provider untouched.
    """
    if rung not in VALID_RUNGS:
        raise CoachValidationError(f"Invalid rung: {rung!r}.")
    pack = load_pack(pack)
    if not isinstance(session_id, str) or session_id not in store.sessions:
        return _refused(UNKNOWN_SESSION, "Unknown coaching session.")
    recorded = store.get_prediction(session_id, twist_id(pack))
    if recorded is None:
        return _refused(NO_TWIST_PREDICTION,
                        "No Twist prediction recorded for this session.")
    if recorded["choice"] == "not_sure":
        return _refused(NOT_DEFINITE,
                        "No definite prediction was recorded.")
    claim = build_twist_claim(recorded["choice"], twist_claim_spec(pack))
    if claim is None:
        return _refused(NOT_ASSESSABLE,
                        "The Twist claim cannot be judged.")
    served = store.sessions[session_id].setdefault("rungs", [])
    if rung == "R2" and "R1" not in served:
        return _refused(RUNG_OUT_OF_ORDER,
                        "See the first question (R1) before the evidence.")
    if rung == "R4" and "R2" not in served:
        return _refused(RUNG_OUT_OF_ORDER,
                        "See the evidence pointer (R2) before confirming.")
    result = solver.solve(netlist)
    if result.ok is not True:
        return _refused(NOT_SOLVED,
                        "The submitted circuit has no valid simulation.")
    verdict = evaluator.evaluate(claim, netlist, result)
    if verdict.status == evaluator.CONSISTENT:
        return _refused(NOT_CONTRADICTED,
                        "The recorded prediction is consistent with the model.")
    if verdict.status != evaluator.CONTRADICTED:
        return _refused(NOT_ASSESSABLE,
                        "The claim cannot be judged against this circuit.")
    facts = solver_facts(result)
    if rung in ("R2", "R4"):
        builder = r2_pointer if rung == "R2" else r4_prompt
        text = builder(claim_component=claim["component"], facts=facts,
                       netlist=netlist)
        serving = DETERMINISTIC_PROVIDER
    else:
        try:
            text = provider.r1_question(choice=recorded["choice"],
                                        why=recorded["why"], facts=facts)
            serving = provider.name
        except CoachProviderError as err:
            log.warning("coach primary failed: stage=%s http_status=%s "
                        "shape=%s reason=%s",
                        err.stage, err.http_status, err.shape, err.reason)
            if fallback is None:
                raise
            text = fallback.r1_question(choice=recorded["choice"],
                                        why=recorded["why"], facts=facts)
            serving = fallback.name
    if rung not in served:
        served.append(rung)
    return {
        "eligible": True,
        "rung": rung,
        "text": text,
        "provider": serving,
        "claim": claim,
    }
