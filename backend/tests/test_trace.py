"""Trace events: every AI-route response says what ran and what checked it.

Only real events are recorded: refusals and malformed requests carry no
trace because no provider was touched. All provider calls are mocked.
"""

import io
import json
from datetime import datetime

import pytest

from app import create_app
from verityn import coach, fake_coach, meta_coach, trace as trace_mod, vision

TWIST = "L1T1"

TWIST_START = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "S1", "type": "switch", "closed": False, "a": "p", "b": "m"},
    {"id": "L1", "type": "bulb", "a": "m", "b": "n1"},
    {"id": "W9", "type": "wire", "a": "n1", "b": "0"},
]}

TINY_PNG = "data:image/png;base64,iVBORw0KGgo="

PROPOSAL = {
    "status": "ready",
    "components": [
        {"id": "B1", "type": "battery", "closed": None,
         "polarity": {"positive": "a", "negative": "b"},
         "evidence": {"region_id": "r-battery",
                       "bounds": {"x": 0.1, "y": 0.2,
                                  "width": 0.12, "height": 0.2},
                       "rotation": 0}},
        {"id": "L1", "type": "bulb", "closed": None, "polarity": None,
         "evidence": {"region_id": "r-bulb",
                       "bounds": {"x": 0.7, "y": 0.2,
                                  "width": 0.12, "height": 0.2},
                       "rotation": 0}},
    ],
    "connections": [
        {"from": {"node": "B1", "terminal": "a"},
         "to": {"node": "L1", "terminal": "a"}, "uncertain": False,
         "evidence": {"region_id": "r-wire-1"}},
        {"from": {"node": "L1", "terminal": "b"},
         "to": {"node": "B1", "terminal": "b"}, "uncertain": False,
         "evidence": {"region_id": "r-wire-2"}},
    ],
}


def _wav():
    return (b"RIFF" + (36).to_bytes(4, "little") + b"WAVE" +
            b"fmt " + (16).to_bytes(4, "little") +
            (1).to_bytes(2, "little") + (1).to_bytes(2, "little") +
            (16000).to_bytes(4, "little") + (32000).to_bytes(4, "little") +
            (2).to_bytes(2, "little") + (16).to_bytes(2, "little") +
            b"data" + (4).to_bytes(4, "little") + b"\x00\x00\x00\x00")


class VoiceStub:
    def transcribe(self, audio):
        return "The switch is open."


def _record_twist(client):
    response = client.post("/api/coach/predict", json={
        "challenge_id": TWIST, "choice": "yes", "why": "Looks complete.",
    })
    return response.get_json()["session_id"]


def _assert_trace_shape(event):
    assert set(event) == {"tool", "input", "output", "guard",
                          "decided_by", "ms", "attempts", "t"}
    assert isinstance(event["ms"], int) and event["ms"] >= 0
    assert isinstance(event["attempts"], int) and event["attempts"] >= 1
    datetime.fromisoformat(event["t"])


def test_guard_for_names_decider_honestly():
    assert trace_mod.guard_for("meta-spark", "meta-spark") == (
        "accepted", "validator")
    assert trace_mod.guard_for("deterministic", "meta-spark") == (
        "accepted", "solver")
    assert trace_mod.guard_for("prototype-fake", "meta-spark",
                               "validate") == ("fallback:template", "validator")
    assert trace_mod.guard_for("prototype-fake", "meta-spark",
                               "transport") == ("fallback:template", "none")
    assert trace_mod.guard_for("prototype-fake", "prototype-fake") == (
        "fallback:template", "none")


def test_ask_r1_template_trace():
    client = create_app().test_client()
    session_id = _record_twist(client)
    body = client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_START,
        "rung": "R1"}).get_json()
    assert body["provider"] == "prototype-fake"
    _assert_trace_shape(body["trace"])
    assert body["trace"]["tool"] == "prototype-fake"
    assert body["trace"]["input"] == "text"
    assert body["trace"]["output"] == "structured-hint"
    assert body["trace"]["guard"] == "fallback:template"
    assert body["trace"]["decided_by"] == "none"
    assert body["trace"]["attempts"] == 1


def test_ask_r1_trace_reports_single_validation_retry(monkeypatch):
    responses = iter([
        {"misconception_id": "open_switch_conducts",
         "question": "Is it dark?"},
        {"misconception_id": "open_switch_conducts",
         "question": "What does the open switch change about the loop?"},
    ])
    calls = []

    def reply(*_args):
        calls.append(True)
        return 200, {"choices": [{"message": {
            "content": json.dumps(next(responses))}}]}

    monkeypatch.setattr(meta_coach, "_post_json", reply)
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"))
    client = app.test_client()
    session_id = _record_twist(client)
    body = client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_START,
        "rung": "R1"}).get_json()

    assert body["provider"] == "meta-spark"
    assert len(calls) == 2
    assert body["trace"]["attempts"] == 2


def test_ask_r2_deterministic_trace():
    client = create_app().test_client()
    session_id = _record_twist(client)
    client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_START, "rung": "R1"})
    body = client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_START,
        "rung": "R2"}).get_json()
    assert body["provider"] == "deterministic"
    assert body["trace"]["tool"] == "deterministic"
    assert body["trace"]["guard"] == "accepted"
    assert body["trace"]["decided_by"] == "solver"


def test_ask_refusal_carries_no_trace():
    client = create_app().test_client()
    body = client.post("/api/coach/ask", json={
        "session_id": "unknown", "netlist": TWIST_START,
        "rung": "R1"}).get_json()
    assert body["eligible"] is False
    assert "trace" not in body


def test_ask_failover_credits_validator_on_validate_stage():
    class FailingProvider:
        name = "meta-spark"
        model = "muse-spark-1.3"

        def r1_question(self, **_kwargs):
            raise coach.CoachProviderError("Meta output rejected.",
                                           stage="validate",
                                           reason="not-question")

    app = create_app(FailingProvider(),
                     fallback=fake_coach.FakeCoachProvider())
    client = app.test_client()
    session_id = _record_twist(client)
    body = client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_START,
        "rung": "R1"}).get_json()
    assert body["provider"] == "prototype-fake"
    assert body["trace"]["guard"] == "fallback:template"
    assert body["trace"]["decided_by"] == "validator"


def test_conversation_success_and_failure_traces():
    client = create_app().test_client()
    ok_body = client.post("/api/coach/conversation", json={
        "message": "I think it will light."}).get_json()
    assert ok_body["trace"]["output"] == "conversation-reply"
    assert ok_body["trace"]["guard"] == "fallback:template"

    failing = create_app(fake_coach.FakeCoachProvider(fail=True))
    failing_client = failing.test_client()
    response = failing_client.post("/api/coach/conversation", json={
        "message": "I think it will light."})
    assert response.status_code == 502
    failed = response.get_json()["trace"]
    assert failed["guard"] == "rejected:transport"
    assert failed["decided_by"] == "validator"


def test_explain_trace():
    client = create_app().test_client()
    body = client.post("/api/coach/explain", json={
        "netlist": TWIST_START}).get_json()
    assert body["trace"]["output"] == "structured-explanation"
    assert body["trace"]["guard"] == "fallback:template"


def test_transcribe_trace():
    client = create_app(voice_provider=VoiceStub()).test_client()
    response = client.post(
        "/api/voice/transcribe",
        data={"audio": (io.BytesIO(_wav()), "recording.wav", "audio/wav")},
    )
    assert response.status_code == 200
    event = response.get_json()["trace"]
    _assert_trace_shape(event)
    assert event["input"] == "audio"
    assert event["output"] == "transcript"
    assert event["guard"] == "accepted"
    assert event["decided_by"] == "none"


def test_transcribe_errors_carry_no_trace():
    client = create_app().test_client()
    response = client.post(
        "/api/voice/transcribe",
        data={"audio": (io.BytesIO(_wav()), "recording.wav", "audio/wav")},
    )
    assert response.status_code == 503
    assert "trace" not in response.get_json()


def test_vision_success_trace(monkeypatch):
    import json as json_lib

    def reply(*_args):
        return 200, {"choices": [{"message": {
            "content": json_lib.dumps(PROPOSAL)}}]}

    monkeypatch.setattr(meta_coach, "_post_json", reply)
    app = create_app(vision_provider=vision.MetaVisionProvider(
        api_key="test-key-9"))
    body = app.test_client().post(
        "/api/vision/propose", json={"image": TINY_PNG}).get_json()
    assert body["provider"] == "meta-spark"
    _assert_trace_shape(body["trace"])
    assert body["trace"]["tool"] == "muse-spark-1.3"
    assert body["trace"]["input"] == "image"
    assert body["trace"]["output"] == "proposal"
    assert body["trace"]["guard"] == "accepted"
    assert body["trace"]["decided_by"] == "validator"


def test_vision_failure_trace(monkeypatch):
    def boom(*_args):
        raise coach.CoachProviderError("Meta output rejected.",
                                       stage="validate",
                                       reason="not-proposal")

    monkeypatch.setattr(meta_coach, "_post_json", boom)
    app = create_app(vision_provider=vision.MetaVisionProvider(
        api_key="test-key-9"))
    response = app.test_client().post(
        "/api/vision/propose", json={"image": TINY_PNG})
    assert response.status_code == 500
    event = response.get_json()["trace"]
    assert event["guard"] == "rejected:not-proposal"
    assert event["tool"] == "muse-spark-1.3"
