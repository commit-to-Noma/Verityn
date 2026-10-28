"""Fresh M9a tests: Meta Spark provider, validation, fallback, redaction.

The HTTP transport is always mocked; no test touches the network or
spends credits. Live verification needs an explicitly authorized run.
"""

import io
import json
import urllib.error
import urllib.request

import pytest

from app import create_app
from verityn import coach, fake_coach, meta_coach

TWIST_ID = "L1T1"

TWIST_WIRED = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "p", "b": "0"},
    {"id": "S1", "type": "switch", "closed": False, "a": "p", "b": "m"},
    {"id": "L1", "type": "bulb", "a": "m", "b": "n1"},
    {"id": "W9", "type": "wire", "a": "n1", "b": "0"},
]}

FACTS = {"L1.power_W": 0.0, "L1.current_A": 0.0, "L1.voltage_V": 0.0,
         "B1.power_W": 0.0, "B1.current_A": 0.0, "B1.voltage_V": 6.0}

DARK_TWIST_QUESTION = (
    "The battery still holds 6.0 V, yet L1 reads 0.0 A and 0.0 W. "
    "Which component prevents charge from making a complete loop?")

GOOD_ID = "open_switch_conducts"
GOOD_Q = "What does the open switch change about the loop?"


def chat_response(obj):
    return {"choices": [{"message": {"content": json.dumps(obj)}}]}


def chat_raw(content):
    return {"choices": [{"message": {"content": content}}]}


@pytest.fixture
def provider():
    return meta_coach.MetaSparkProvider(api_key="test-key-1")


def test_verified_model_constants():
    assert meta_coach.META_MODEL == "muse-spark-1.3"
    assert meta_coach.META_API_BASE == "https://api.meta.ai/v1"
    assert meta_coach.MetaSparkProvider.name == "meta-spark"


@pytest.mark.parametrize("api_key", ["", None])
def test_missing_key_fails_fast(api_key):
    with pytest.raises(ValueError):
        meta_coach.MetaSparkProvider(api_key=api_key)


def test_valid_output_returns_diagnosis_and_question():
    diagnosis, question = meta_coach.validate_model_output(
        {"misconception_id": GOOD_ID, "question": GOOD_Q}, FACTS)
    assert diagnosis == GOOD_ID
    assert question == GOOD_Q


@pytest.mark.parametrize("raw_id", ["made-up", None, 7, ["x"]])
def test_unknown_id_downgrades_to_unclear(raw_id):
    diagnosis, question = meta_coach.validate_model_output(
        {"misconception_id": raw_id, "question": GOOD_Q}, FACTS)
    assert diagnosis == "unclear"
    assert question == GOOD_Q


@pytest.mark.parametrize("output", [
    "just a string",
    ["a list"],
    None,
    42,
    {},
    {"misconception_id": GOOD_ID},
    {"misconception_id": GOOD_ID, "question": None},
    {"misconception_id": GOOD_ID, "question": ""},
    {"misconception_id": GOOD_ID, "question": "   "},
    {"misconception_id": GOOD_ID, "question": "No question mark"},
])
def test_malformed_output_rejected(output):
    with pytest.raises(coach.CoachProviderError):
        meta_coach.validate_model_output(output, FACTS)


@pytest.mark.parametrize("question", [
    "What about 6 here?",
    "What do L1 and W3 need?",
    "Is R1 relevant?",
])
def test_facts_numbers_and_part_ids_pass(question):
    _, served = meta_coach.validate_model_output(
        {"misconception_id": GOOD_ID, "question": question}, FACTS)
    assert served == question


@pytest.mark.parametrize("question", [
    "What about 42 here?",
    "Is it 0.5?",
    "First the 2 loops?",
])
def test_outside_numbers_rejected(question):
    with pytest.raises(coach.CoachProviderError):
        meta_coach.validate_model_output(
            {"misconception_id": GOOD_ID, "question": question}, FACTS)


@pytest.mark.parametrize("question", [
    "Is it dark?",
    "Will it stay dark?",
    "Just connect the wire?",
    "What current flows?",
    "Because the loop is open?",
])
def test_leaks_rejected(question):
    with pytest.raises(coach.CoachProviderError):
        meta_coach.validate_model_output(
            {"misconception_id": GOOD_ID, "question": question}, FACTS)


def test_request_shape_and_auth(monkeypatch, provider):
    calls = {}

    def fake_post(url, payload, headers, timeout_s):
        calls.update(url=url, payload=payload, headers=headers,
                     timeout=timeout_s)
        return 200, chat_response({"misconception_id": GOOD_ID,
                                   "question": GOOD_Q})

    monkeypatch.setattr(meta_coach, "_post_json", fake_post)
    served = provider.r1_question(choice="yes", why="The switch?",
                                  facts=FACTS)
    assert served == GOOD_Q
    assert calls["url"] == "https://api.meta.ai/v1/chat/completions"
    assert calls["headers"]["Authorization"] == "Bearer test-key-1"
    assert calls["payload"]["model"] == "muse-spark-1.3"
    assert calls["payload"]["temperature"] == 0
    assert calls["timeout"] == 10
    user_text = calls["payload"]["messages"][1]["content"]
    assert "The switch?" in user_text
    assert "power_W" in user_text


def test_missing_facts_rejected(provider):
    with pytest.raises(coach.CoachProviderError):
        provider.r1_question(choice="yes", why="x")


@pytest.mark.parametrize("code", [401, 403, 429, 500])
def test_post_json_maps_http_errors(monkeypatch, code):
    def boom(request, timeout):
        raise urllib.error.HTTPError(request.full_url, code, "err", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    with pytest.raises(coach.CoachProviderError,
                        match=f"HTTP {code}"):
        meta_coach._post_json("http://x", {}, {}, 1)


def test_post_json_maps_timeout_and_network_errors(monkeypatch):
    def timeout(request, timeout):
        raise TimeoutError("slow")

    monkeypatch.setattr(urllib.request, "urlopen", timeout)
    with pytest.raises(coach.CoachProviderError, match="timed out"):
        meta_coach._post_json("http://x", {}, {}, 1)

    def unreachable(request, timeout):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(urllib.request, "urlopen", unreachable)
    with pytest.raises(coach.CoachProviderError, match="request failed"):
        meta_coach._post_json("http://x", {}, {}, 1)


def test_post_json_rejects_garbage_body(monkeypatch):
    class Resp:
        status = 200

        def read(self):
            return b"<html>not json"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(urllib.request, "urlopen",
                        lambda request, timeout: Resp())
    with pytest.raises(coach.CoachProviderError, match="malformed"):
        meta_coach._post_json("http://x", {}, {}, 1)


@pytest.mark.parametrize("content", [
    json.dumps({"misconception_id": GOOD_ID,
                "question": "Is it dark MARKER-1?"}),
    "MARKER-2 not json at all",
])
def test_rejections_carry_no_model_text(monkeypatch, provider, content):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, chat_raw(content)))
    with pytest.raises(coach.CoachProviderError) as exc:
        provider.r1_question(choice="yes", why="x", facts=FACTS)
    assert "MARKER" not in str(exc.value)
    assert "test-key-1" not in str(exc.value)


def record_yes(client):
    res = client.post("/api/coach/predict", json={
        "challenge_id": TWIST_ID, "choice": "yes",
        "why": "The switch is open."})
    assert res.status_code == 200
    return res.get_json()["session_id"]


def test_fallback_serves_template_when_primary_fails():
    app = create_app(fake_coach.FakeCoachProvider(fail=True),
                     fallback=fake_coach.FakeCoachProvider())
    client = app.test_client()
    session_id = record_yes(client)
    ans = client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_WIRED}).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert ans["text"] == DARK_TWIST_QUESTION


def test_rejected_model_output_falls_back(monkeypatch):
    def leaky(*args):
        return 200, chat_response({"misconception_id": GOOD_ID,
                                   "question": "Is it dark?"})

    monkeypatch.setattr(meta_coach, "_post_json", leaky)
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    client = app.test_client()
    res = client.post("/api/coach/predict", json={
        "challenge_id": TWIST_ID, "choice": "yes", "why": "wired the gap"})
    ans = client.post("/api/coach/ask", json={
        "session_id": res.get_json()["session_id"],
        "netlist": TWIST_WIRED}).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert ans["text"] == DARK_TWIST_QUESTION


def test_real_provider_round_trip_mocked(monkeypatch):
    def good(*args):
        return 200, chat_response({"misconception_id": GOOD_ID,
                                   "question": GOOD_Q})

    monkeypatch.setattr(meta_coach, "_post_json", good)
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"))
    client = app.test_client()
    session_id = record_yes(client)
    ans = client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_WIRED}).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "meta-spark"
    assert ans["text"] == GOOD_Q


def ask_twist_yes(client):
    session_id = record_yes(client)
    return client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_WIRED})


def test_every_transport_failure_falls_back(monkeypatch):
    failures = [
        urllib.error.HTTPError("http://x", 401, "bad", {}, None),
        urllib.error.HTTPError("http://x", 402, "billing", {}, None),
        urllib.error.HTTPError("http://x", 403, "denied", {}, None),
        urllib.error.HTTPError("http://x", 429, "slow", {}, None),
        urllib.error.HTTPError("http://x", 500, "broke", {}, None),
        TimeoutError("slow"),
        urllib.error.URLError("down"),
    ]
    for failure in failures:
        def boom(request, timeout, _failure=failure):
            raise _failure

        monkeypatch.setattr(urllib.request, "urlopen", boom)
        app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                         fallback=fake_coach.FakeCoachProvider())
        ans = ask_twist_yes(app.test_client()).get_json()
        assert ans["eligible"] is True, failure
        assert ans["provider"] == "prototype-fake", failure
        assert ans["text"] == DARK_TWIST_QUESTION, failure
        assert ans["claim"] == {"type": "lit", "component": "L1",
                                "value": True}, failure


def test_error_body_never_reaches_learner(monkeypatch):
    def secret_body(request, timeout):
        raise urllib.error.HTTPError(
            "http://x", 500, "broke", {},
            io.BytesIO(b"SECRET-BODY-MARKER"))

    monkeypatch.setattr(urllib.request, "urlopen", secret_body)
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert "SECRET-BODY-MARKER" not in json.dumps(ans)


@pytest.mark.parametrize("body", [
    {},
    {"choices": []},
    {"choices": [{"message": {}}]},
    {"choices": [{"message": {"content": 42}}]},
    {"choices": [{"message": {"content": "MARKER plain prose"}}]},
])
def test_shape_mismatch_falls_back(monkeypatch, body):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, body))
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert "MARKER" not in json.dumps(ans)


@pytest.mark.parametrize("content", [
    json.dumps({"misconception_id": GOOD_ID,
                "question": "Is it dark?"}),
    json.dumps({"misconception_id": GOOD_ID,
                "question": "What about 42 here?"}),
    json.dumps({"misconception_id": GOOD_ID,
                "question": "A statement, not a question."}),
    json.dumps({"misconception_id": GOOD_ID}),
    "not json at all",
])
def test_rejected_output_falls_back(monkeypatch, content):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, chat_raw(content)))
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert ans["text"] == DARK_TWIST_QUESTION


def test_split_question_passes_validation():
    diagnosis, question = meta_coach.validate_model_output(
        {"misconception_id": GOOD_ID,
         "question": "What splits the loop?"}, FACTS)
    assert diagnosis == GOOD_ID
    assert question == "What splits the loop?"


def test_logs_transport_stage_with_status(monkeypatch, caplog):
    def boom(request, timeout):
        raise urllib.error.HTTPError(
            "http://x", 429, "slow", {}, io.BytesIO(b"SECRET-BODY"))

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert "stage=transport http_status=429" in caplog.text
    assert "SECRET-BODY" not in caplog.text


def test_logs_parse_stage(monkeypatch, caplog):
    class Resp:
        status = 200

        def read(self):
            return b"<html>not json"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(urllib.request, "urlopen",
                        lambda request, timeout: Resp())
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert "stage=parse http_status=None" in caplog.text


def test_logs_validate_stage_without_model_text(monkeypatch, caplog):
    def leaky(*args):
        return 200, chat_response(
            {"misconception_id": GOOD_ID,
             "question": "Is it dark MARKER-LOG?"})

    monkeypatch.setattr(meta_coach, "_post_json", leaky)
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert "stage=validate http_status=None" in caplog.text
    assert "MARKER-LOG" not in caplog.text


def test_logs_never_include_exception_text(caplog):
    class Evil:
        name = "evil"

        def r1_question(self, *, choice, why, facts=None):
            raise coach.CoachProviderError(
                "EVIL-MARKER should never be logged",
                stage="transport", http_status=418)

    app = create_app(Evil(), fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert "stage=transport http_status=418" in caplog.text
    assert "EVIL-MARKER" not in caplog.text


def test_failure_without_fallback_logs_and_500s(caplog):
    app = create_app(fake_coach.FakeCoachProvider(fail=True))
    client = app.test_client()
    session_id = record_yes(client)
    res = client.post("/api/coach/ask", json={
        "session_id": session_id, "netlist": TWIST_WIRED})
    assert res.status_code == 500
    assert "stage=transport http_status=None" in caplog.text


def test_describe_shape_reports_structure_not_values():
    sketch = meta_coach.describe_shape({"b": 1, "a": "SECRET-VAL"})
    assert sketch == "dict[a,b]"
    assert meta_coach.describe_shape([]) == "list[]len=0"
    assert meta_coach.describe_shape([{"x": 1}]) == "list[dict]len=1"
    assert meta_coach.describe_shape("SECRET-VAL") == "str[len=10]"
    assert meta_coach.describe_shape(42) == "int"
    assert meta_coach.describe_shape(None) == "NoneType"
    sketch = meta_coach.describe_shape({"k": "SECRET-VAL", "n": ["x"]})
    assert "SECRET" not in sketch


def test_describe_shape_scrubs_and_truncates_keys():
    sketch = meta_coach.describe_shape({"a\nb": 1, "z" * 200: 2})
    assert "\n" not in sketch
    assert len(sketch) <= len("dict[]") + 160


@pytest.mark.parametrize("body, shape", [
    ({"error": {"message": "SECRET-VAL", "code": 7}},
     "shape=dict[error]"),
    ({"choices": [{"message": {"content": [
        {"type": "text", "text": "SECRET-VAL"}]}}]},
     "shape=content:list[dict]len=1,msg:dict[content]"),
    ({"choices": [{"message": {"content": "SECRET prose, no braces"}}]},
     "shape=str[len=23,braces=no]"),
])
def test_parse_failures_log_shape_not_values(monkeypatch, caplog, body,
                                             shape):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, body))
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert "stage=parse http_status=None" in caplog.text
    assert shape in caplog.text
    assert "SECRET" not in caplog.text


def test_garbage_body_logs_byte_length(monkeypatch, caplog):
    class Resp:
        status = 200

        def read(self):
            return b"<html>not json"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(urllib.request, "urlopen",
                        lambda request, timeout: Resp())
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert "shape=bytes[len=14]" in caplog.text


@pytest.mark.parametrize("content, shape", [
    ("[1, 2]", "shape=list[int]len=2"),
    ("42", "shape=int"),
    ('"ok"', "shape=str[len=2]"),
])
def test_non_dict_output_logs_shape(monkeypatch, caplog, content, shape):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, chat_raw(content)))
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert "stage=parse http_status=None" in caplog.text
    assert shape in caplog.text


def test_response_format_constrains_output(monkeypatch, provider):
    seen = {}

    def capture(url, payload, headers, timeout_s):
        seen["url"] = url
        seen["payload"] = payload
        return 200, chat_response({"misconception_id": GOOD_ID,
                                   "question": GOOD_Q})

    monkeypatch.setattr(meta_coach, "_post_json", capture)
    assert provider.r1_question(choice="yes", why="w", facts=FACTS) == GOOD_Q
    assert seen["url"] == "https://api.meta.ai/v1/chat/completions"
    assert seen["payload"]["model"] == "muse-spark-1.3"
    assert [m["role"] for m in seen["payload"]["messages"]] == [
        "system", "user"]
    assert seen["payload"]["reasoning_effort"] == "minimal"
    assert seen["payload"]["max_completion_tokens"] == 1024
    assert "max_tokens" not in seen["payload"]
    fmt = seen["payload"]["response_format"]
    assert fmt["type"] == "json_schema"
    schema = fmt["json_schema"]
    assert schema["name"] == "coach_r1"
    assert schema["strict"] is True
    body = schema["schema"]
    assert body["type"] == "object"
    assert body["properties"]["misconception_id"]["enum"] == list(
        meta_coach.MISCONCEPTION_IDS)
    assert body["properties"]["question"]["type"] == "string"
    assert body["required"] == ["misconception_id", "question"]
    assert body["additionalProperties"] is False


@pytest.mark.parametrize("message, shape", [
    ({"content": None}, "shape=content:NoneType,msg:dict[content]"),
    ({"role": "assistant", "content": None, "refusal": "MARKER-REFUSAL"},
     "shape=content:NoneType,msg:dict[content,refusal,role]"),
])
def test_null_content_falls_back_and_sketches_message(monkeypatch, caplog,
                                                      message, shape):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, {"choices": [{"message": message}]}))
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert "stage=parse http_status=None" in caplog.text
    assert shape in caplog.text
    assert "MARKER-REFUSAL" not in caplog.text
    assert "assistant" not in caplog.text


def _null_body(**choice):
    message = {"content": None}
    return {"choices": [{"message": message, **choice}]}


@pytest.mark.parametrize("body, present, absent", [
    ({"choices": [{"message": {"content": None},
                   "finish_reason": "length"}],
      "usage": {"prompt_tokens": 54321, "completion_tokens": 300}},
     ["finish=length", "ctoks=300"], ["54321"]),
    ({"choices": [{"message": {"content": None},
                   "finish_reason": "stop"}],
      "usage": {"completion_tokens": 42}},
     ["finish=stop", "ctoks=42"], []),
    (_null_body(), ["finish=other"], ["ctoks="]),
    (_null_body(finish_reason="bogus"), ["finish=other"], ["bogus"]),
    (_null_body(finish_reason=42), ["finish=other"], ["ctoks="]),
    ({"choices": [{"message": {"content": None}}],
      "usage": {"completion_tokens": "300"}},
     ["finish=other"], ["ctoks="]),
    ({"choices": [{"message": {"content": None}}],
      "usage": {"completion_tokens": -1}},
     ["finish=other"], ["ctoks="]),
    ({"choices": [{"message": {"content": None}}],
      "usage": {"completion_tokens": True}},
     ["finish=other"], ["ctoks="]),
    ({"choices": [{"message": {"content": None}}], "usage": "x"},
     ["finish=other"], ["ctoks="]),
    ({"choices": [{"message": {"content": '{"q": }'},
                   "finish_reason": "length"}],
      "usage": {"completion_tokens": 300}},
     ["braces=yes", "finish=length", "ctoks=300"], []),
    ({"choices": [{"message": {"content": "[1,2]"},
                   "finish_reason": "stop"}],
      "usage": {"completion_tokens": 12}},
     ["list[int]len=2", "finish=stop", "ctoks=12"], []),
])
def test_completion_diagnostics(monkeypatch, caplog, body, present, absent):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, body))
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert "stage=parse http_status=None" in caplog.text
    for text in present:
        assert text in caplog.text
    for text in absent:
        assert text not in caplog.text


@pytest.mark.parametrize("question, reason", [
    ("MARKER-NQ just a statement.", "not-question"),
    ("Why is MARKER-LEAK dark?", "leak"),
    ("What does MARKER-9 change?", "number"),
])
def test_validate_reasons(question, reason):
    with pytest.raises(coach.CoachProviderError) as exc:
        meta_coach.validate_model_output(
            {"misconception_id": GOOD_ID, "question": question}, FACTS)
    assert exc.value.stage == "validate"
    assert exc.value.reason == reason
    assert "MARKER" not in str(exc.value)


@pytest.mark.parametrize("question, reason, marker", [
    ("MARKER-NQ just a statement.", "not-question", "MARKER-NQ"),
    ("Why is MARKER-LEAK dark?", "leak", "MARKER-LEAK"),
    ("What does MARKER-9 change?", "number", "MARKER-9"),
])
def test_validate_reason_logged_without_model_text(monkeypatch, caplog,
                                                   question, reason,
                                                   marker):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *args: (200, chat_response(
                            {"misconception_id": GOOD_ID,
                             "question": question})))
    app = create_app(meta_coach.MetaSparkProvider(api_key="dummy"),
                     fallback=fake_coach.FakeCoachProvider())
    ans = ask_twist_yes(app.test_client()).get_json()
    assert ans["eligible"] is True
    assert ans["provider"] == "prototype-fake"
    assert "stage=validate http_status=None" in caplog.text
    assert f"reason={reason}" in caplog.text
    assert marker not in caplog.text
