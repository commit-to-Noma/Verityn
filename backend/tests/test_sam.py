"""Isolated SAM 3.1 spike tests: contract, parser, errors.

The HTTP transport is always mocked or injected; no test touches the
network or spends credits. Live verification needs the standalone
scripts/sam_spike.py run with explicit authorization.
"""

import io
import json
import urllib.error
import urllib.request

import pytest

from verityn import sam

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
JPG = b"\xff\xd8\xff" + b"1" * 64
WEBP = b"RIFF" + b"2" * 4 + b"WEBP" + b"3" * 64

LANE_ONE = ("<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=80|>"
            "<|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>")
LANE_CONF = ("<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=80;c=0.75|>"
             "<|mask;x=0;y=0;c=0.75;data=5,5,!!!!!(QO(0lu8?|>")


def enable(monkeypatch):
    monkeypatch.setenv("VERITYN_SAM_ENABLED", "1")


def completed_lane(text):
    return {"status": "completed",
            "output": [{"id": "msg-1",
                        "content": [{"type": "output_text",
                                     "text": text}]}]}


class FakeResponse:
    def __init__(self, raw, status=200):
        self._raw = raw
        self.status = status

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_module_is_isolated_from_core():
    source = open(sam.__file__).read()
    for lineno, line in enumerate(source.split("\n"), 1):
        stripped = line.strip()
        assert not stripped.startswith("import verityn"), lineno
        assert not stripped.startswith("from verityn"), lineno


@pytest.mark.parametrize("value,expected", [
    ("1", True), ("true", True), ("TRUE", True), ("yes", True),
    (" 1 ", True), ("", False), ("0", False), ("no", False),
])
def test_flag_parsing(monkeypatch, value, expected):
    monkeypatch.setenv("VERITYN_SAM_ENABLED", value)
    assert sam.sam_enabled() is expected


def test_flag_defaults_off(monkeypatch):
    monkeypatch.delenv("VERITYN_SAM_ENABLED", raising=False)
    assert sam.sam_enabled() is False


@pytest.mark.parametrize("data,mime", [
    (PNG, "image/png"), (JPG, "image/jpeg"), (WEBP, "image/webp")])
def test_sniff_mime_from_magic_bytes(data, mime):
    assert sam.sniff_mime(data) == mime


@pytest.mark.parametrize("data", [b"GIF89a", b"", b"RIFFxxxxNOTW"])
def test_sniff_mime_rejects_unknown(data):
    with pytest.raises(sam.SamError) as exc:
        sam.sniff_mime(data)
    assert exc.value.stage == "request"


def test_sniff_mime_rejects_non_bytes():
    with pytest.raises(sam.SamError) as exc:
        sam.sniff_mime("not bytes")
    assert exc.value.stage == "request"


def test_validate_prompt_trims():
    assert sam.validate_prompt("  battery  ") == "battery"


@pytest.mark.parametrize("text", ["", "   ", "x" * 121, 7, None,
                                  "<0f>1<|box|>", "red |> circle"])
def test_validate_prompt_rejects(text):
    with pytest.raises(sam.SamError) as exc:
        sam.validate_prompt(text)
    assert exc.value.stage == "request"


def test_build_image_payload_exact_shape():
    payload = sam.build_image_payload(prompt="battery", image_bytes=PNG)
    assert payload["model"] == "sam-3.1"
    assert payload["stream"] is False
    assert payload["metadata"] == {"include_confidence": "true"}
    (message,) = payload["input"]
    assert message["type"] == "message"
    assert message["role"] == "user"
    text_part, image_part = message["content"]
    assert text_part == {"type": "input_text", "text": "battery"}
    assert image_part["type"] == "input_image"
    prefix, encoded = image_part["image_url"].split(";base64,")
    assert prefix == "data:image/png"
    import base64
    assert base64.b64decode(encoded) == PNG


def test_build_image_payload_omits_metadata_when_off():
    payload = sam.build_image_payload(prompt="battery", image_bytes=JPG,
                                      include_confidence=False)
    assert "metadata" not in payload
    assert payload["input"][0]["content"][1]["image_url"].startswith(
        "data:image/jpeg;base64,")


def test_build_image_payload_rejects_bad_model():
    with pytest.raises(sam.SamError) as exc:
        sam.build_image_payload(prompt="battery", image_bytes=PNG,
                                model="not a model!")
    assert exc.value.stage == "request"


def test_build_image_payload_rejects_oversize():
    big = b"\x89PNG\r\n\x1a\n" + b"0" * sam.SAM_MAX_IMAGE_BYTES
    with pytest.raises(sam.SamError) as exc:
        sam.build_image_payload(prompt="battery", image_bytes=big)
    assert exc.value.stage == "request"


def test_build_image_payload_rejects_mime_mismatch():
    with pytest.raises(sam.SamError) as exc:
        sam.build_image_payload(prompt="battery", image_bytes=PNG,
                                mime="image/jpeg")
    assert exc.value.stage == "request"


def test_post_json_success(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["auth"] = request.headers.get("Authorization")
        seen["timeout"] = timeout
        assert json.loads(request.data) == {"a": 1}
        return FakeResponse(b'{"ok": true}', status=200)

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    status, body = sam._post_json("https://x.test/responses", {"a": 1},
                                  "sekret", 5)
    assert (status, body) == (200, {"ok": True})
    assert seen["url"] == "https://x.test/responses"
    assert seen["auth"] == "Bearer sekret"
    assert seen["timeout"] == 5


def test_post_json_http_error(monkeypatch):
    def fail(request, timeout):
        raise urllib.error.HTTPError("https://x", 400, "bad", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", fail)
    with pytest.raises(sam.SamError) as exc:
        sam._post_json("https://x.test", {}, "k", 5)
    assert exc.value.stage == "transport"
    assert exc.value.http_status == 400
    assert "sekret" not in str(exc.value)


def test_post_json_timeout_and_unreachable(monkeypatch):
    def slow(request, timeout):
        raise TimeoutError("slow")

    monkeypatch.setattr(urllib.request, "urlopen", slow)
    with pytest.raises(sam.SamError) as exc:
        sam._post_json("https://x.test", {}, "k", 5)
    assert exc.value.stage == "transport"
    assert exc.value.http_status is None

    def down(request, timeout):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(urllib.request, "urlopen", down)
    with pytest.raises(sam.SamError) as exc:
        sam._post_json("https://x.test", {}, "k", 5)
    assert exc.value.stage == "transport"


def test_post_json_bad_json(monkeypatch):
    def garbage(request, timeout):
        return FakeResponse(b"not json{{", status=200)

    monkeypatch.setattr(urllib.request, "urlopen", garbage)
    with pytest.raises(sam.SamError) as exc:
        sam._post_json("https://x.test", {}, "k", 5)
    assert exc.value.stage == "response"
    assert exc.value.http_status == 200


def test_extract_output_text_ok():
    assert sam.extract_output_text(completed_lane(LANE_ONE)) == LANE_ONE


@pytest.mark.parametrize("body", [
    {"status": "incomplete"}, {"status": "failed"},
    {"status": "completed", "output": [{"id": "m", "content": [
        {"type": "refusal", "refusal": "no"}]}]},
    {"status": "completed", "output": []},
    {"status": "completed", "output": "nope"},
    {"status": "weird"}, "nope", None,
])
def test_extract_output_text_failures(body):
    with pytest.raises(sam.SamError) as exc:
        sam.extract_output_text(body)
    assert exc.value.stage == "response"


def test_extract_output_text_rejects_two_lanes():
    body = {"status": "completed",
            "output": [{"id": "m", "content": [
                {"type": "output_text", "text": "a"},
                {"type": "output_text", "text": "b"}]}]}
    with pytest.raises(sam.SamError) as exc:
        sam.extract_output_text(body)
    assert exc.value.stage == "response"


def test_parse_empty_lane_is_zero_matches():
    assert sam.parse_lane("") == ([], [])
    assert sam.parse_lane("  \n ") == ([], [])


def test_parse_official_example_line():
    records, warnings = sam.parse_lane(LANE_ONE)
    assert warnings == []
    assert records == [{
        "id": "0",
        "box": {"left": 10, "top": 20, "right": 15, "bottom": 25,
                "width": 100, "height": 80, "confidence": None},
        "mask": {"height": 5, "width": 5, "encoding": "one_bit",
                 "confidence": None},
    }]
    assert "!!!!!(QO(0lu8?" not in repr(records)


def test_parse_confidence_and_one_bit_mask():
    lane = ("<0f>10<|mask;x=0;y=0;c=1e-1;data=2,3,!!!abc|>"
            "<|box;x1=0;y1=0;x2=1;y2=1;w=9;h=9;c=.5|>")
    records, warnings = sam.parse_lane(lane)
    assert warnings == []
    (record,) = records
    assert record["id"] == "10"
    assert record["box"]["confidence"] == 0.5
    assert record["box"]["right"] == 2
    assert record["mask"]["encoding"] == "one_bit"
    assert record["mask"]["confidence"] == pytest.approx(0.1)


def test_parse_multi_record_commas_optional():
    lane = (LANE_ONE + ",2<|box;x1=0;y1=0;x2=0;y2=0;w=10;h=10|>"
            "<|mask;x=0;y=0;data=1,1,~zz|>")
    records, _ = sam.parse_lane(lane)
    assert [record["id"] for record in records] == ["0", "2"]
    assert records[1]["mask"]["encoding"] == "lossless"


def test_parse_ignores_unknown_token_with_warning():
    lane = ("<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|>"
            "<|future;x=1|><|mask;x=0;y=0;data=1,1,~z|>")
    records, warnings = sam.parse_lane(lane)
    assert len(records) == 1
    assert warnings == ["ignored_token:future"]


def test_parse_ignores_bad_confidence():
    lane = ("<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4;c=9|>"
            "<|mask;x=0;y=0;data=1,1,~z|>")
    records, warnings = sam.parse_lane(lane)
    assert records[0]["box"]["confidence"] is None
    assert warnings == ["ignored_confidence"]


@pytest.mark.parametrize("lane", [
    "<7f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|>",
    "<0f>",
    "0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|>",
    "<0f>0<|mask;x=0;y=0;data=1,1,~z|>",
    "<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|>",
    ("<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|>"
     "<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|>"),
    "<0f>0<|box;x1=0;y1=0;x2=9;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|>",
    "<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=0;h=4|><|mask;x=0;y=0;data=1,1,~z|>",
    "<0f>0 junk <|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|>",
    "<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=1;y=0;data=1,1,~z|>",
    "<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,~z|>",
    "<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,zzz|>",
    "<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|",
    "<0f>x<|box;x1=0;y1=0;x2=0;y2=0;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|>",
    "<0f>0<|box;x1=0;y1=0;x2=0;y2=0;x2=1;w=4;h=4|><|mask;x=0;y=0;data=1,1,~z|>",
])
def test_parse_malformed_lines_raise(lane):
    with pytest.raises(sam.SamError) as exc:
        sam.parse_lane(lane)
    assert exc.value.stage == "parse"


def test_parse_rejects_non_string():
    with pytest.raises(sam.SamError) as exc:
        sam.parse_lane(None)
    assert exc.value.stage == "parse"


def test_segment_image_refuses_when_disabled(monkeypatch):
    monkeypatch.delenv("VERITYN_SAM_ENABLED", raising=False)
    with pytest.raises(sam.SamError) as exc:
        sam.segment_image(api_key="k", prompt="battery",
                          image_bytes=PNG)
    assert exc.value.stage == "request"


def test_segment_image_needs_key_and_https(monkeypatch):
    enable(monkeypatch)
    with pytest.raises(sam.SamError) as exc:
        sam.segment_image(api_key="", prompt="battery",
                          image_bytes=PNG)
    assert exc.value.stage == "request"
    with pytest.raises(sam.SamError) as exc:
        sam.segment_image(api_key="k", prompt="battery",
                          image_bytes=PNG,
                          base_url="http://evil.test")
    assert exc.value.stage == "request"


def test_segment_image_success_injected(monkeypatch):
    enable(monkeypatch)
    seen = {}

    def fake_post(url, payload, api_key, timeout_s):
        seen["url"] = url
        seen["prompt"] = payload["input"][0]["content"][0]["text"]
        return 200, completed_lane(LANE_ONE)

    out = sam.segment_image(api_key="k", prompt="battery",
                            image_bytes=PNG, _post=fake_post)
    assert seen["url"] == "https://api.meta.ai/v1/responses"
    assert seen["prompt"] == "battery"
    assert len(out["records"]) == 1
    assert out["warnings"] == []


def test_segment_image_empty_lane_is_not_found(monkeypatch):
    enable(monkeypatch)
    out = sam.segment_image(
        api_key="k", prompt="switch", image_bytes=PNG,
        _post=lambda *a: (200, completed_lane("")))
    assert out == {"records": [], "warnings": []}


def test_segment_image_propagates_stages(monkeypatch):
    enable(monkeypatch)

    def fail_transport(*args):
        raise sam.SamError("down", stage="transport")

    with pytest.raises(sam.SamError) as exc:
        sam.segment_image(api_key="k", prompt="battery",
                          image_bytes=PNG, _post=fail_transport)
    assert exc.value.stage == "transport"

    def bad_lane(*args):
        return 200, completed_lane("<0f>")

    with pytest.raises(sam.SamError) as exc:
        sam.segment_image(api_key="k", prompt="battery",
                          image_bytes=PNG, _post=bad_lane)
    assert exc.value.stage == "parse"
