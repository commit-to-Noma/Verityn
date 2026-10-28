"""Snap & Build tests: image parsing, proposal validation, endpoint.

All model HTTP is mocked; no test touches the network or spends
credits. Live vision use needs an explicitly authorized probe proving
image support on the account.
"""

import base64
import copy
import io
import json
import urllib.error
import urllib.request

import pytest

from app import create_app
from verityn import coach, meta_coach, solver, vision

TINY_PNG = "data:image/png;base64,iVBORw0KGgo="

GOOD_PROPOSAL = {
    "status": "needs_review",
    "components": [
        {"id": "B1", "type": "battery", "closed": None,
         "polarity": {"positive": "a", "negative": "b"},
         "evidence": {"region_id": "r-battery",
                       "bounds": {"x": 0.1, "y": 0.2,
                                  "width": 0.12, "height": 0.2},
                       "rotation": 0}},
        {"id": "S1", "type": "switch", "closed": True,
         "polarity": None,
         "evidence": {"region_id": "r-switch",
                       "bounds": {"x": 0.4, "y": 0.2,
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
         "to": {"node": "S1", "terminal": "a"}, "uncertain": False,
         "evidence": {"region_id": "r-wire-1"}},
        {"from": {"node": "S1", "terminal": "b"},
         "to": {"node": "L1", "terminal": "a"}, "uncertain": True,
         "evidence": {"region_id": "r-wire-2"}},
    ],
}


def chat_response(obj):
    return {"choices": [{"message": {"content": json.dumps(obj)}}]}


@pytest.fixture
def provider():
    return vision.MetaVisionProvider(api_key="test-key-9")


@pytest.fixture
def app(provider):
    return create_app(vision_provider=provider)


@pytest.mark.parametrize("url", [
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/jpeg;base64,/9j/2Q==",
    "data:image/webp;base64,UklGRg==",
])
def test_parse_data_url_accepts_allowlisted_images(url):
    assert vision.parse_data_url(url) == url


@pytest.mark.parametrize("image", [
    None,
    42,
    "not-a-data-url",
    "data:image/gif;base64,R0lGODg=",
    "data:image/png,iVBORw0KGgo=",
    "data:image/png;base64,!!!not-base64!!!",
    "data:image/png;base64,",
])
def test_parse_data_url_rejects_bad_images(image):
    with pytest.raises(vision.VisionRequestError,
                       match="Invalid image payload."):
        vision.parse_data_url(image)


def test_parse_data_url_rejects_oversize_images():
    big = base64.b64encode(b"x" * (vision.VISION_MAX_IMAGE_BYTES + 1))
    with pytest.raises(vision.VisionRequestError,
                       match="Invalid image payload."):
        vision.parse_data_url("data:image/png;base64," + big.decode())


def test_validate_proposal_accepts_canonical():
    before = copy.deepcopy(GOOD_PROPOSAL)
    assert vision.validate_proposal(GOOD_PROPOSAL) == GOOD_PROPOSAL
    assert GOOD_PROPOSAL == before


def _mutated(path, value):
    bad = copy.deepcopy(GOOD_PROPOSAL)
    target = bad
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    return bad


@pytest.mark.parametrize("bad", [
    "just a string",
    ["a list"],
    {},
    {"components": [], "connections": []},
    {"components": [{"id": "B1", "type": "battery"}] * 17,
     "connections": []},
    _mutated(("components", 0, "id"), "9bad"),
    _mutated(("components", 0, "id"), "has space"),
    _mutated(("components", 0, "id"), "L1"),
    _mutated(("components", 0, "id"), "x" * 17),
    _mutated(("components", 2, "type"), "resistor"),
    _mutated(("components", 2, "type"), "capacitor"),
    _mutated(("components", 1,), {"id": "S1", "type": "switch"}),
    _mutated(("components", 2,), {"id": "L1", "type": "bulb",
                                  "closed": False}),
    _mutated(("components", 0,),
             {"id": "B1", "type": "battery", "volts": 6}),
    _mutated(("connections", 0, "from", "node"), "ZZ"),
    _mutated(("connections", 0, "from", "node"), ["B1"]),
    _mutated(("connections", 0, "from", "terminal"), "c"),
    _mutated(("connections", 0, "from"),
             {"node": "B1", "terminal": "a", "extra": 1}),
    _mutated(("connections", 0, "to"), {"node": "B1", "terminal": "a"}),
    _mutated(("connections", 1,),
             {"from": {"node": "S1", "terminal": "a"},
              "to": {"node": "B1", "terminal": "a"},
              "uncertain": False}),
    _mutated(("connections", 0, "uncertain"), "maybe"),
    _mutated(("connections", 0,),
             {"from": {"node": "B1", "terminal": "a"},
              "to": {"node": "S1", "terminal": "a"}}),
])
def test_validate_proposal_rejects_malformed(bad):
    with pytest.raises(coach.CoachProviderError) as exc:
        vision.validate_proposal(bad)
    assert exc.value.stage == "validate"
    assert str(exc.value) == "Vision proposal rejected."


def test_propose_sends_image_and_schema(monkeypatch, provider):
    seen = {}

    def capture(url, payload, headers, timeout_s):
        seen["url"] = url
        seen["payload"] = payload
        return 200, chat_response(GOOD_PROPOSAL)

    monkeypatch.setattr(meta_coach, "_post_json", capture)
    assert provider.propose(TINY_PNG) == GOOD_PROPOSAL
    assert seen["url"] == "https://api.meta.ai/v1/chat/completions"
    payload = seen["payload"]
    assert payload["model"] == "muse-spark-1.3"
    assert payload["reasoning_effort"] == "minimal"
    assert payload["max_completion_tokens"] == 2048
    assert "max_tokens" not in payload
    user_content = payload["messages"][1]["content"]
    assert {"type": "text",
            "text": "Transcribe this circuit schematic."} in user_content
    images = [part for part in user_content
              if part.get("type") == "image_url"]
    assert len(images) == 1
    assert images[0]["image_url"]["url"] == TINY_PNG
    schema = payload["response_format"]["json_schema"]
    assert payload["response_format"]["type"] == "json_schema"
    assert schema["name"] == "vision_proposal"
    assert schema["strict"] is True


def test_missing_key_fails_fast():
    with pytest.raises(ValueError):
        vision.MetaVisionProvider(api_key="")


def test_propose_without_provider_is_unavailable():
    res = create_app().test_client().post(
        "/api/vision/propose", json={"image": TINY_PNG})
    assert res.status_code == 500
    assert res.get_json() == {"error_code": "INTERNAL_ERROR",
                              "error_message": "Vision unavailable."}


def test_propose_rejects_bad_image(app):
    res = app.test_client().post("/api/vision/propose",
                                 json={"image": "nope"})
    assert res.status_code == 400
    body = res.get_json()
    assert body["error_code"] == "MALFORMED_REQUEST"
    assert body["error_message"] == "Invalid image payload."


def test_propose_rejects_malformed_body(app):
    res = app.test_client().post("/api/vision/propose", json=["nope"])
    assert res.status_code == 400
    assert res.get_json()["error_code"] == "MALFORMED_REQUEST"


def test_propose_success(monkeypatch, app):
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *a: (200, chat_response(GOOD_PROPOSAL)))
    res = app.test_client().post("/api/vision/propose",
                                 json={"image": TINY_PNG})
    assert res.status_code == 200
    body = res.get_json()
    assert body["proposal"] == GOOD_PROPOSAL
    assert body["assumptions"] == list(vision.ASSUMPTIONS)
    assert body["provider"] == "meta-spark"


def test_propose_never_touches_solver(monkeypatch, app):
    def boom(*args):
        raise AssertionError("solver must not run on propose")

    monkeypatch.setattr(solver, "solve", boom)
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *a: (200, chat_response(GOOD_PROPOSAL)))
    res = app.test_client().post("/api/vision/propose",
                                 json={"image": TINY_PNG})
    assert res.status_code == 200


def test_invalid_model_output_500s_without_content(monkeypatch, app,
                                                   caplog):
    bad = {"components": [{"id": "MARKER-EVIL", "type": "warpdrive"}],
           "connections": []}
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *a: (200, chat_response(bad)))
    res = app.test_client().post("/api/vision/propose",
                                 json={"image": TINY_PNG})
    assert res.status_code == 500
    assert res.get_json()["error_message"] == "Unexpected server error."
    assert "stage=validate" in caplog.text
    assert "MARKER-EVIL" not in caplog.text


def test_http_error_500s_without_content(monkeypatch, app, caplog):
    def boom(request, timeout):
        raise urllib.error.HTTPError(
            "http://x", 500, "broke", {}, io.BytesIO(b"SECRET-BODY"))

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    res = app.test_client().post("/api/vision/propose",
                                 json={"image": TINY_PNG})
    assert res.status_code == 500
    assert "stage=http http_status=500" in caplog.text
    assert "SECRET-BODY" not in caplog.text
    assert "iVBORw0KGgo" not in caplog.text


def test_network_failure_logs_no_status(monkeypatch, app, caplog):
    def down(request, timeout):
        raise urllib.error.URLError("unreachable")

    monkeypatch.setattr(urllib.request, "urlopen", down)
    res = app.test_client().post("/api/vision/propose",
                                 json={"image": TINY_PNG})
    assert res.status_code == 500
    assert "stage=transport http_status=None" in caplog.text
    assert "unreachable" not in caplog.text
    assert "iVBORw0KGgo" not in caplog.text


def test_validate_proposal_rejects_battery_without_polarity():
    bad = copy.deepcopy(GOOD_PROPOSAL)
    del bad["components"][0]["polarity"]
    with pytest.raises(coach.CoachProviderError):
        vision.validate_proposal(bad)


def test_validate_proposal_rejects_inconsistent_status():
    bad = copy.deepcopy(GOOD_PROPOSAL)
    bad["status"] = "ready"
    with pytest.raises(coach.CoachProviderError):
        vision.validate_proposal(bad)


def test_validate_proposal_accepts_unsupported_without_parts():
    proposal = {"status": "unsupported", "components": [], "connections": []}
    assert vision.validate_proposal(proposal) == proposal


def _captured_payload(monkeypatch, provider, data_url):
    seen = {}

    def capture(url, payload, headers, timeout_s):
        seen["url"] = url
        seen["payload"] = payload
        return 200, chat_response(GOOD_PROPOSAL)

    monkeypatch.setattr(meta_coach, "_post_json", capture)
    provider.propose(data_url)
    return seen


def test_propose_user_message_matches_documented_shape(monkeypatch,
                                                       provider):
    seen = _captured_payload(monkeypatch, provider, TINY_PNG)
    assert seen["url"] == "https://api.meta.ai/v1/chat/completions"
    messages = seen["payload"]["messages"]
    assert messages[0] == {"role": "system",
                           "content": vision._SYSTEM_PROMPT}
    assert messages[1]["role"] == "user"
    content = messages[1]["content"]
    assert isinstance(content, list)
    assert {"type": "text",
            "text": "Transcribe this circuit schematic."} in content
    images = [part for part in content
              if part.get("type") == "image_url"]
    assert len(images) == 1
    assert set(images[0]) == {"type", "image_url"}
    assert set(images[0]["image_url"]) == {"url"}
    assert images[0]["image_url"]["url"] == TINY_PNG
    assert seen["payload"]["response_format"] == {
        "type": "json_schema",
        "json_schema": vision._PROPOSAL_JSON_SCHEMA}


def _fixture_data_url(name):
    from pathlib import Path
    raw = (Path(__file__).resolve().parents[2] / "tests" / "fixtures"
           / "sam_spike" / name).read_bytes()
    return raw, "data:image/png;base64," + base64.b64encode(raw).decode()


def test_png_fixture_produces_single_prefix_data_url():
    raw, data_url = _fixture_data_url("05_textbook_simple..png")
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"
    assert vision.parse_data_url(data_url) == data_url
    assert data_url.count("data:") == 1
    assert data_url.count(";base64,") == 1
    header, _, encoded = data_url.partition(",")
    assert header == "data:image/png;base64"
    assert base64.b64decode(encoded, validate=True) == raw


def test_propose_sends_fixture_bytes_verbatim(monkeypatch, provider):
    raw, data_url = _fixture_data_url("08_digital_verityn.png")
    seen = _captured_payload(monkeypatch, provider, data_url)
    content = seen["payload"]["messages"][1]["content"]
    url = [part for part in content
           if part.get("type") == "image_url"][0]["image_url"]["url"]
    assert url == data_url
    assert base64.b64decode(url.partition(",")[2],
                            validate=True) == raw


def test_http_400_is_request_rejection(monkeypatch, provider):
    calls = []

    def boom(request, timeout):
        calls.append(request)
        raise urllib.error.HTTPError("http://x", 400, "bad", {},
                                     io.BytesIO(b"SECRET-BODY"))

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    with pytest.raises(coach.CoachProviderError) as exc:
        provider.propose(TINY_PNG)
    assert exc.value.stage == "http"
    assert exc.value.http_status == 400
    assert "SECRET-BODY" not in str(exc.value)
    assert len(calls) == 1


def test_dns_failure_is_transport_without_status(monkeypatch,
                                                 provider):
    def down(request, timeout):
        raise urllib.error.URLError("unreachable")

    monkeypatch.setattr(urllib.request, "urlopen", down)
    with pytest.raises(coach.CoachProviderError) as exc:
        provider.propose(TINY_PNG)
    assert exc.value.stage == "transport"
    assert exc.value.http_status is None
    assert "unreachable" not in str(exc.value)


def test_malformed_transport_output_never_returns(monkeypatch,
                                                  provider):
    def boom(*args):
        raise AssertionError("solver must not run on propose")

    monkeypatch.setattr(solver, "solve", boom)
    monkeypatch.setattr(meta_coach, "_post_json",
                        lambda *a: (200, chat_response({"nope": []})))
    with pytest.raises(coach.CoachProviderError) as exc:
        provider.propose(TINY_PNG)
    assert exc.value.stage == "validate"


STRICT_TYPES = {"object", "array", "string", "boolean", "number",
                "null", "integer"}
STRICT_NODE_KEYS = {"type", "properties", "required",
                    "additionalProperties", "items", "enum"}


def check_strict_node(node, path):
    """Recursively enforce the documented strict-subset rules."""
    assert isinstance(node, dict), path
    assert set(node) <= STRICT_NODE_KEYS, (
        f"{path}: unsupported keys {sorted(set(node))}")
    types = node.get("type")
    if isinstance(types, str):
        types = [types]
    assert isinstance(types, list) and types, f"{path} needs a type"
    assert set(types) <= STRICT_TYPES, f"{path}: {types}"
    if "enum" in node:
        assert types == ["string"], f"{path}: enum needs a string"
    if "object" in types:
        assert node.get("additionalProperties") is False, (
            f"{path} must forbid extra properties")
        props = node.get("properties")
        assert isinstance(props, dict) and props, (
            f"{path} needs properties")
        required = node.get("required")
        assert isinstance(required, list), f"{path} needs required"
        assert set(required) == set(props), (
            f"{path}: required {sorted(required)} != "
            f"properties {sorted(props)}")
        for key, sub in props.items():
            check_strict_node(sub, f"{path}.{key}")
    else:
        assert "properties" not in node, f"{path}: no object"
        assert "required" not in node, f"{path}: no object"
        assert "additionalProperties" not in node, f"{path}: no object"
    if "array" in types:
        assert isinstance(node.get("items"), dict), (
            f"{path} needs items")
        check_strict_node(node["items"], f"{path}[]")


def test_response_schema_is_strict_subset():
    wrapper = vision._PROPOSAL_JSON_SCHEMA
    assert set(wrapper) == {"name", "strict", "schema"}
    assert wrapper["strict"] is True
    check_strict_node(wrapper["schema"], "schema")


def test_validate_proposal_preserves_unknown_switch():
    proposal = copy.deepcopy(GOOD_PROPOSAL)
    proposal["components"][1]["closed"] = None
    for conn in proposal["connections"]:
        conn["uncertain"] = False
    proposal["status"] = "needs_review"
    out = vision.validate_proposal(proposal)
    assert out["components"][1]["closed"] is None


def test_validate_proposal_rejects_ready_with_unknown_switch():
    proposal = copy.deepcopy(GOOD_PROPOSAL)
    proposal["components"][1]["closed"] = None
    for conn in proposal["connections"]:
        conn["uncertain"] = False
    proposal["status"] = "ready"
    with pytest.raises(coach.CoachProviderError):
        vision.validate_proposal(proposal)


def test_validate_proposal_preserves_unknown_polarity():
    proposal = copy.deepcopy(GOOD_PROPOSAL)
    proposal["components"][0]["polarity"] = None
    for conn in proposal["connections"]:
        conn["uncertain"] = False
    proposal["status"] = "needs_review"
    out = vision.validate_proposal(proposal)
    assert out["components"][0]["polarity"] is None


def test_validate_proposal_rejects_ready_with_unknown_polarity():
    proposal = copy.deepcopy(GOOD_PROPOSAL)
    proposal["components"][0]["polarity"] = None
    for conn in proposal["connections"]:
        conn["uncertain"] = False
    proposal["status"] = "ready"
    with pytest.raises(coach.CoachProviderError):
        vision.validate_proposal(proposal)


def test_validate_proposal_rejects_missing_closed_key():
    proposal = copy.deepcopy(GOOD_PROPOSAL)
    del proposal["components"][1]["closed"]
    with pytest.raises(coach.CoachProviderError):
        vision.validate_proposal(proposal)


def test_validate_proposal_rejects_mistyped_presence():
    closed = copy.deepcopy(GOOD_PROPOSAL)
    closed["components"][2]["closed"] = True
    with pytest.raises(coach.CoachProviderError):
        vision.validate_proposal(closed)
    polar = copy.deepcopy(GOOD_PROPOSAL)
    polar["components"][1]["polarity"] = {"positive": "a",
                                          "negative": "b"}
    with pytest.raises(coach.CoachProviderError):
        vision.validate_proposal(polar)
