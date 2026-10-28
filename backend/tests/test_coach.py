"""Fresh M8 tests: server-side coaching sessions and eligibility.

The server records predictions itself and re-derives every verdict at
ask-time. These tests prove the trust boundary: unknown sessions,
wrong-challenge sessions, indefinite predictions, unsolved and
unassessable circuits, and consistent predictions are all refused
without calling the provider; only a server-computed CONTRADICTED
verdict earns an R1 question from the fixed template set.
"""

import pytest

from app import create_app
from verityn import coach, fake_coach

TWIST = "L1T1"
LESSON = "L1"

TWIST_START = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "S1", "type": "switch", "closed": False, "a": "p", "b": "m"},
    {"id": "L1", "type": "bulb", "a": "m", "b": "n1"},
]}

WIRE = {"id": "W9", "type": "wire", "a": "n1", "b": "0"}

BULBLESS_LOOP = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "R1", "type": "resistor", "ohms": 10, "a": "p", "b": "0"},
]}


def wired(netlist):
    return {"components": netlist["components"] + [WIRE]}


def lit_twist():
    comps = [dict(c) for c in TWIST_START["components"]]
    for comp in comps:
        if comp["id"] == "S1":
            comp["closed"] = True
    return {"components": comps + [WIRE]}


class CountingProvider:
    """Spy: records provider calls without changing fake behavior."""

    name = "spy"

    def __init__(self):
        self.calls = []

    def r1_question(self, *, choice, why, facts=None):
        self.calls.append((choice, why))
        return fake_coach.route_template(choice, why)


@pytest.fixture
def client():
    return create_app().test_client()


@pytest.fixture
def spy_client():
    spy = CountingProvider()
    return create_app(spy).test_client(), spy


def record(client, challenge_id, choice, why, session_id=None):
    body = {"challenge_id": challenge_id, "choice": choice, "why": why}
    if session_id is not None:
        body["session_id"] = session_id
    res = client.post("/api/coach/predict", json=body)
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def ask(client, session_id, netlist, **extra):
    res = client.post("/api/coach/ask",
                      json={"session_id": session_id, "netlist": netlist,
                            **extra})
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def test_predict_mints_session_and_echoes(client):
    first = record(client, TWIST, "yes", "The loop looks complete.")
    second = record(client, TWIST, "no", "The switch is open.")
    assert len(first["session_id"]) >= 20
    assert first["session_id"] != second["session_id"]
    assert first["challenge_id"] == TWIST
    assert first["choice"] == "yes"


def test_predict_continues_session_and_binds_twist(client):
    first = record(client, LESSON, "no", "It is broken.")
    second = record(client, TWIST, "yes", "Now it is fixed.", first["session_id"])
    assert second["session_id"] == first["session_id"]
    verdict = ask(client, second["session_id"], wired(TWIST_START))
    assert verdict["eligible"] is True
    assert verdict["claim"] == {"type": "lit", "component": "L1",
                                "value": True}


def test_predict_unknown_session_mints_fresh(client):
    recorded = record(client, TWIST, "yes", "Hi.", "no-such-session")
    assert recorded["session_id"] != "no-such-session"


@pytest.mark.parametrize("body", [
    {"challenge_id": "L9", "choice": "yes", "why": ""},
    {"challenge_id": ["L1T1"], "choice": "yes", "why": ""},
    {"challenge_id": TWIST, "choice": "maybe", "why": ""},
    {"challenge_id": TWIST, "choice": True, "why": ""},
    {"challenge_id": TWIST, "choice": None, "why": ""},
    {"challenge_id": TWIST, "choice": "yes", "why": 42},
    {"challenge_id": TWIST, "choice": "yes", "why": None},
    {"challenge_id": TWIST, "choice": "yes", "why": "x" * 501},
    {"challenge_id": TWIST, "choice": "yes", "why": "", "session_id": 7},
    {"choice": "yes", "why": ""},
])
def test_predict_rejects_bad_input(client, body):
    res = client.post("/api/coach/predict", json=body)
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"


def test_predict_rejects_non_object_body(client):
    res = client.post("/api/coach/predict", json=["nope"])
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"


def test_predict_accepts_empty_and_max_why(client):
    assert record(client, TWIST, "no", "")["session_id"]
    assert record(client, TWIST, "no", "y" * 500)["session_id"]
    res = client.post("/api/coach/predict",
                      json={"challenge_id": TWIST, "choice": "yes"})
    assert res.status_code == 200
    assert res.get_json()["session_id"]


def test_store_keeps_why_verbatim():
    store = coach.SessionStore()
    session_id = store.record_prediction(TWIST, "yes", "   \n  ")
    stored = store.get_prediction(session_id, TWIST)
    assert stored == {"choice": "yes", "why": "   \n  "}
    assert fake_coach.route_template("yes", stored["why"]).endswith("?")


def test_ask_unknown_session(client):
    verdict = ask(client, "no-such-session", wired(TWIST_START))
    assert verdict == {"eligible": False,
                       "reason_code": coach.UNKNOWN_SESSION,
                       "message": verdict["message"]}


def test_ask_rejects_lesson_only_session(client):
    recorded = record(client, LESSON, "no", "It is broken.")
    verdict = ask(client, recorded["session_id"], wired(TWIST_START))
    assert verdict["eligible"] is False
    assert verdict["reason_code"] == coach.NO_TWIST_PREDICTION


def test_ask_refuses_not_sure_without_calling_provider(spy_client):
    client, spy = spy_client
    recorded = record(client, TWIST, "not_sure", "No idea.")
    verdict = ask(client, recorded["session_id"], wired(TWIST_START))
    assert verdict["eligible"] is False
    assert verdict["reason_code"] == coach.NOT_DEFINITE
    assert spy.calls == []


def test_ask_refuses_unsolved_netlist(spy_client):
    client, spy = spy_client
    recorded = record(client, TWIST, "yes", "Looks complete.")
    verdict = ask(client, recorded["session_id"], TWIST_START)
    assert verdict["eligible"] is False
    assert verdict["reason_code"] == coach.NOT_SOLVED
    assert spy.calls == []


def test_ask_refuses_unassessable_netlist(spy_client):
    client, spy = spy_client
    recorded = record(client, TWIST, "yes", "Looks complete.")
    verdict = ask(client, recorded["session_id"], BULBLESS_LOOP)
    assert verdict["eligible"] is False
    assert verdict["reason_code"] == coach.NOT_ASSESSABLE
    assert spy.calls == []


def test_ask_refuses_consistent_prediction(spy_client):
    client, spy = spy_client
    recorded = record(client, TWIST, "no", "The switch is open.")
    verdict = ask(client, recorded["session_id"], wired(TWIST_START))
    assert verdict["eligible"] is False
    assert verdict["reason_code"] == coach.NOT_CONTRADICTED
    assert spy.calls == []


def test_ask_ignores_client_supplied_state(client):
    recorded = record(client, TWIST, "no", "The switch is open.")
    verdict = ask(client, recorded["session_id"], wired(TWIST_START),
                  verdict="CONTRADICTED", rung="R4",
                  claim={"type": "lit", "component": "L1", "value": True})
    assert verdict["eligible"] is False
    assert verdict["reason_code"] == coach.NOT_CONTRADICTED


DARK_TWIST_QUESTION = (
    "The battery still holds 6.0 V, yet L1 reads 0.0 A and 0.0 W. "
    "Which component prevents charge from making a complete loop?")


def test_ask_grants_r1_for_contradicted_yes(client):
    recorded = record(client, TWIST, "yes", "The switch is open but wired.")
    verdict = ask(client, recorded["session_id"], wired(TWIST_START))
    assert verdict["eligible"] is True
    assert verdict["rung"] == "R1"
    assert verdict["provider"] == "prototype-fake"
    assert verdict["claim"] == {"type": "lit", "component": "L1",
                                "value": True}
    assert verdict["text"] == DARK_TWIST_QUESTION


def test_ask_judges_submitted_circuit_not_pack(client):
    recorded = record(client, TWIST, "no", "")
    verdict = ask(client, recorded["session_id"], lit_twist())
    assert verdict["eligible"] is True
    assert verdict["claim"]["value"] is False
    assert verdict["text"] == fake_coach.TEMPLATES["no"]["default"]


def test_ask_is_deterministic(client):
    recorded = record(client, TWIST, "yes", "The gap is wired shut.")
    first = ask(client, recorded["session_id"], wired(TWIST_START))
    second = ask(client, recorded["session_id"], wired(TWIST_START))
    assert first["text"] == second["text"]
    assert first["text"] == DARK_TWIST_QUESTION


@pytest.mark.parametrize("body", [
    {"netlist": wired(TWIST_START)},
    {"session_id": "x"},
    {"session_id": 7, "netlist": wired(TWIST_START)},
    {"session_id": "x", "netlist": ["nope"]},
    {"session_id": "x", "netlist": None},
])
def test_ask_rejects_malformed(client, body):
    res = client.post("/api/coach/ask", json=body)
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"


def test_provider_failure_is_safe_500():
    failing = create_app(fake_coach.FakeCoachProvider(fail=True))
    client = failing.test_client()
    recorded = record(client, TWIST, "yes", "Looks complete.")
    res = client.post("/api/coach/ask", json={
        "session_id": recorded["session_id"],
        "netlist": wired(TWIST_START),
    })
    assert res.status_code == 500
    payload = res.get_json()
    assert payload["error_code"] == "INTERNAL_ERROR"
    assert "Traceback" not in res.get_data(as_text=True)


WHY_CORPUS = ["The switch is open I think",
              "maybe the wire gap matters",
              "CONNECT the thing already",
              "it stays dark",
              "0 watts through it",
              "wire L1.b to B1.b",
              "the bulb will light because the battery is strong",
              "",
              "   ",
              "x" * 500,
              "Switch at the very end " + "y" * 480 + "switch"]


def test_templates_are_questions_without_leaks():
    assert len(fake_coach.ALL_TEXTS) == 6
    for text in fake_coach.ALL_TEXTS:
        assert text.endswith("?")
        assert not any(char.isdigit() for char in text)
        assert coach.find_leak(text) is None, text


def test_grounded_question_cites_dark_bulb_facts():
    facts = {"B1.voltage_V": 9.0, "L1.current_A": 0.1,
             "L1.power_W": 0.0}
    assert fake_coach.grounded_question(facts) == (
        "The battery still holds 9.0 V, yet L1 reads 0.1 A and "
        "0.0 W. Which component prevents charge from making a "
        "complete loop?")


def test_grounded_question_is_safe_question():
    facts = {"B1.voltage_V": 6.0, "L1.current_A": 0.0,
             "L1.power_W": 0.0}
    text = fake_coach.grounded_question(facts)
    assert text.endswith("?")
    assert coach.find_leak(text) is None
    assert "switch" not in text.lower()


@pytest.mark.parametrize("facts", [
    None,
    "not a dict",
    {},
    {"B1.voltage_V": 6.0},
    {"B1.voltage_V": 6.0, "L1.current_A": 0.0,
     "L1.power_W": "zero"},
    {"B1.voltage_V": float("nan"), "L1.current_A": 0.0,
     "L1.power_W": 0.0},
    {"B1.voltage_V": 6.0, "L1.current_A": 0.0,
     "L1.power_W": float("inf")},
    {"B1.voltage_V": 6.0, "L1.current_A": 0.6,
     "L1.power_W": 3.6},
])
def test_grounded_question_falls_back_without_dark_facts(facts):
    assert fake_coach.grounded_question(facts) is None


def test_r1_falls_back_to_routed_template_without_facts():
    provider = fake_coach.FakeCoachProvider()
    assert provider.r1_question(choice="yes", why="no clue",
                                facts=None) == \
        fake_coach.TEMPLATES["yes"]["default"]
    assert provider.r1_question(choice="yes", why="no clue") == \
        fake_coach.TEMPLATES["yes"]["default"]


@pytest.mark.parametrize("text,expected", [
    ("Is it dark?", "dark"),
    ("Utter darkness?", "dark"),
    ("Is it lit?", "lit"),
    ("What splits the loop?", None),
    ("The switch stays open?", "stays"),
    ("6 volts?", "volt"),
    ("Wired shut?", "wire"),
    ("Connected now?", "connect"),
    ("Open item?", None),
    ("Open it?", "open it"),
    ("won’t it light?", "won't"),
    ("No current flows?", "no current"),
    ("What current flows?", "current"),
    ("Add a part?", "add a"),
    ("Because reasons?", "because"),
    # Accepted residual: conservative match on a word no real
    # question contains; the fallback stays safe either way.
    ("mustard?", "must"),
])
def test_find_leak_boundaries(text, expected):
    assert coach.find_leak(text) == expected


@pytest.mark.parametrize("choice", ["yes", "no"])
@pytest.mark.parametrize("why", WHY_CORPUS)
def test_routing_stays_inside_fixed_templates(choice, why):
    text = fake_coach.route_template(choice, why)
    assert text in fake_coach.ALL_TEXTS
    assert text in fake_coach.TEMPLATES[choice].values()
    assert why not in text or why.strip() == ""


def test_routing_picks_relevant_template():
    assert fake_coach.route_template("yes", "The SWITCH is open") == \
        fake_coach.TEMPLATES["yes"]["switch"]
    assert fake_coach.route_template("yes", "wired the gap") == \
        fake_coach.TEMPLATES["yes"]["gap"]
    assert fake_coach.route_template("yes", "no clue") == \
        fake_coach.TEMPLATES["yes"]["default"]
    assert fake_coach.route_template("no", "no clue") == \
        fake_coach.TEMPLATES["no"]["default"]
    assert fake_coach.TEMPLATES["yes"]["default"] != \
        fake_coach.TEMPLATES["no"]["default"]
