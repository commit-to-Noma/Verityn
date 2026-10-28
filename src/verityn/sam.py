"""Isolated SAM 3.1 spike client (World-As-Lab, feature-flagged).

Text-prompted image segmentation through the Meta Model API
Responses endpoint. Follows Meta's official meta-sam contract only:

- request envelope: typescript/examples/api-playground/server/
  openai-request.ts (POST {base}/responses, unary stream:false for
  images, input_text noun phrase plus input_image data URL, string
  metadata; streaming image requests answer response.failed)
- output grammar: protocol/sam3.md (one <Nf> line per frame, one box
  plus one mask token per record, empty lane = zero matches)
- model and base: playground README (sam-3.1,
  https://api.meta.ai/v1)

Isolation: stdlib only, no imports from the solver, evaluator,
coach, or lesson code, and nothing in the learning journey imports
this module. segment_image refuses to run unless VERITYN_SAM_ENABLED
is set (see sam_enabled).

Privacy: mask payloads are opaque base85. They are validated
structurally and dropped: never returned, never logged. Errors carry
fixed messages plus a stage and optional HTTP status only.
"""

import base64
import json
import math
import os
import re
import urllib.error
import urllib.request

SAM_API_BASE = "https://api.meta.ai/v1"
SAM_MODEL = "sam-3.1"
SAM_TIMEOUT_S = 60
SAM_MAX_IMAGE_BYTES = 10 * 1024 * 1024
SAM_MAX_PROMPT_CHARS = 120

MODEL_ID_PATTERN = re.compile(r"[A-Za-z0-9._:-]{1,120}\Z")
MIME_TYPES = ("image/jpeg", "image/png", "image/webp")

STAGES = ("request", "transport", "response", "parse")


class SamError(RuntimeError):
    """A SAM spike failure with controlled fields only.

    message is always a fixed string: never image bytes, keys,
    prompts, or model output. stage names the failure step;
    http_status carries the upstream status when one exists.
    """

    def __init__(self, message, *, stage, http_status=None):
        super().__init__(message)
        self.stage = stage
        self.http_status = http_status


def sam_enabled():
    """True only when the spike flag is explicitly switched on."""
    return os.environ.get("VERITYN_SAM_ENABLED", "").strip().lower() in (
        "1", "true", "yes")


def sniff_mime(data):
    """Identify jpeg/png/webp from magic bytes, never the filename."""
    if not isinstance(data, bytes):
        raise SamError("SAM needs raw image bytes.", stage="request")
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise SamError("SAM needs a jpeg, png, or webp image.", stage="request")


def validate_prompt(text):
    """Clean a noun-phrase prompt; object prompts must not mix in."""
    if not isinstance(text, str):
        raise SamError("SAM needs a text prompt.", stage="request")
    phrase = text.strip()
    if not phrase:
        raise SamError("SAM needs a non-empty prompt.", stage="request")
    if len(phrase) > SAM_MAX_PROMPT_CHARS:
        raise SamError("SAM prompt is too long.", stage="request")
    if "<" in phrase or "|>" in phrase:
        raise SamError("SAM noun phrases cannot carry object prompts.",
                       stage="request")
    return phrase


def build_image_payload(*, prompt, image_bytes, mime=None, model=SAM_MODEL,
                        include_confidence=True):
    """Build the exact unary Responses request for one image."""
    if not isinstance(model, str) or not MODEL_ID_PATTERN.match(model):
        raise SamError("SAM model id is invalid.", stage="request")
    if not isinstance(image_bytes, bytes) or not image_bytes:
        raise SamError("SAM needs raw image bytes.", stage="request")
    if len(image_bytes) > SAM_MAX_IMAGE_BYTES:
        raise SamError("SAM image exceeds the size limit.", stage="request")
    detected = sniff_mime(image_bytes)
    if mime is None:
        mime = detected
    if mime != detected or mime not in MIME_TYPES:
        raise SamError("SAM needs a jpeg, png, or webp image.",
                       stage="request")
    phrase = validate_prompt(prompt)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": model,
        "stream": False,
        "input": [{
            "type": "message",
            "role": "user",
            "content": [
                {"type": "input_text", "text": phrase},
                {"type": "input_image",
                 "image_url": f"data:{mime};base64,{encoded}"},
            ],
        }],
    }
    if include_confidence:
        payload["metadata"] = {"include_confidence": "true"}
    return payload


def _post_json(url, payload, api_key, timeout_s):
    headers = {"Accept": "application/json",
               "Authorization": f"Bearer {api_key}",
               "Content-Type": "application/json"}
    data = json.dumps(payload).encode()
    request = urllib.request.Request(url, data=data, headers=headers,
                                     method="POST")
    try:
        with urllib.request.urlopen(request,
                                    timeout=timeout_s) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as err:
        raise SamError(f"SAM request failed (HTTP {err.code}).",
                       stage="transport",
                       http_status=err.code) from err
    except TimeoutError as err:
        raise SamError("SAM request timed out.",
                       stage="transport") from err
    except urllib.error.URLError as err:
        raise SamError("SAM request failed.",
                       stage="transport") from err
    try:
        return status, json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        raise SamError("SAM response malformed.", stage="response",
                       http_status=status) from err


def extract_output_text(body):
    """Pull the single output_text lane from a unary Responses body."""
    if not isinstance(body, dict):
        raise SamError("SAM response malformed.", stage="response")
    status = body.get("status")
    if status == "refusal":
        raise SamError("SAM refused the request.", stage="response")
    if status == "incomplete":
        raise SamError("SAM response incomplete.", stage="response")
    if status == "failed":
        raise SamError("SAM request failed upstream.", stage="response")
    if status != "completed":
        raise SamError("SAM response malformed.", stage="response")
    output = body.get("output")
    if not isinstance(output, list):
        raise SamError("SAM response malformed.", stage="response")
    lanes = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "refusal":
                raise SamError("SAM refused the request.",
                               stage="response")
            if (part.get("type") == "output_text"
                    and isinstance(part.get("text"), str)):
                lanes.append(part["text"])
    if len(lanes) != 1:
        raise SamError("SAM response has no single text lane.",
                       stage="response")
    return lanes[0]


_FRAME_RE = re.compile(r"<(\d+)f(;[^>]*)?>")
_ID_RE = re.compile(r"\d+")
_INT_RE = re.compile(r"-?\d+\Z")
_UINT_RE = re.compile(r"\d+\Z")
_CONF_RE = re.compile(r"-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\Z")

_IGNORED_TOKEN = "ignored_token"
_IGNORED_FIELD = "ignored_field"
_IGNORED_CONFIDENCE = "ignored_confidence"


def _fail():
    raise SamError("SAM lane malformed.", stage="parse")


def _parse_token(body, warnings):
    """Split one token body into its name and validated field map."""
    chunks = body.split(";")
    name = chunks[0].strip()
    if not re.match(r"[A-Za-z][A-Za-z0-9_.-]*\Z", name):
        _fail()
    fields = {}
    for chunk in chunks[1:]:
        if chunk.strip() == "":
            continue
        key, sep, value = chunk.partition("=")
        key = key.strip()
        if sep == "":
            warnings.add(f"{_IGNORED_FIELD}:{key or '?'}")
            continue
        value = value.strip()
        if key in fields and key != "c":
            _fail()
        if key == "c" and key in fields:
            warnings.add(_IGNORED_CONFIDENCE)
            continue
        fields[key] = value
    return name, fields


def _parse_confidence(fields, warnings):
    """Read the optional confidence, ignoring bad values per spec."""
    if "c" not in fields:
        return None
    text = fields["c"]
    if not _CONF_RE.match(text):
        warnings.add(_IGNORED_CONFIDENCE)
        return None
    try:
        value = float(text)
    except ValueError:
        warnings.add(_IGNORED_CONFIDENCE)
        return None
    if not math.isfinite(value) or value < 0 or value > 1:
        warnings.add(_IGNORED_CONFIDENCE)
        return None
    return 0.0 if value == 0 else value


def _parse_box(fields, warnings):
    for key in ("x1", "y1", "x2", "y2"):
        if key not in fields or not _INT_RE.match(fields[key]):
            _fail()
    for key in ("w", "h"):
        if key not in fields or not _UINT_RE.match(fields[key]):
            _fail()
    x1, y1, x2, y2 = (int(fields[k]) for k in ("x1", "y1", "x2", "y2"))
    width, height = int(fields["w"]), int(fields["h"])
    if width <= 0 or height <= 0:
        _fail()
    if not (0 <= x1 <= x2 < width and 0 <= y1 <= y2 < height):
        _fail()
    return {"left": x1, "top": y1, "right": x2 + 1, "bottom": y2 + 1,
            "width": width, "height": height,
            "confidence": _parse_confidence(fields, warnings)}


def _parse_mask(fields, warnings):
    for key in ("x", "y"):
        if key not in fields or not _INT_RE.match(fields[key]):
            _fail()
        if int(fields[key]) != 0:
            _fail()
    if "data" not in fields:
        _fail()
    parts = fields["data"].split(",")
    if len(parts) != 3:
        _fail()
    rows, cols, payload = parts
    if (not _UINT_RE.match(rows) or not _UINT_RE.match(cols)
            or not rows or not cols):
        _fail()
    height, width = int(rows), int(cols)
    if height <= 0 or width <= 0 or height >= 2 ** 53 or width >= 2 ** 53:
        _fail()
    if not payload or payload[0] not in ("~", "!"):
        _fail()
    return {"height": height, "width": width,
            "encoding": "lossless" if payload[0] == "~" else "one_bit",
            "confidence": _parse_confidence(fields, warnings)}


def _parse_record(obj_id, tokens, warnings):
    boxes = [token for token in tokens if token[0] == "box"]
    masks = [token for token in tokens if token[0] == "mask"]
    for name, _fields in tokens:
        if name not in ("box", "mask"):
            warnings.add(f"{_IGNORED_TOKEN}:{name}")
    if len(boxes) != 1 or len(masks) != 1:
        _fail()
    return {"id": obj_id,
            "box": _parse_box(boxes[0][1], warnings),
            "mask": _parse_mask(masks[0][1], warnings)}


def parse_lane(text):
    """Parse one image output_text lane into records plus warnings.

    Returns (records, warnings). An empty lane is valid and means
    zero matches. Anything malformed raises SamError: the spike
    records that as an error, never as found or not-found.
    """
    if not isinstance(text, str):
        raise SamError("SAM lane malformed.", stage="parse")
    records = []
    warnings = set()
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if line == "":
            continue
        header = _FRAME_RE.match(line)
        if header is None:
            _fail()
        if int(header.group(1)) != 0:
            _fail()
        if header.group(2):
            warnings.add(f"{_IGNORED_FIELD}:frame")
        rest = line[header.end():]
        pos = 0
        end = len(rest)
        segments = 0
        while True:
            while pos < end and rest[pos] in ", \t":
                pos += 1
            if pos >= end:
                break
            id_match = _ID_RE.match(rest, pos)
            if id_match is None:
                _fail()
            obj_id = id_match.group(0)
            pos = id_match.end()
            tokens = []
            while rest.startswith("<|", pos):
                close = rest.find("|>", pos + 2)
                if close < 0:
                    _fail()
                tokens.append(_parse_token(rest[pos + 2:close], warnings))
                pos = close + 2
            if not tokens:
                _fail()
            records.append(_parse_record(obj_id, tokens, warnings))
            segments += 1
        if segments == 0:
            _fail()
    return records, sorted(warnings)


def segment_image(*, api_key, prompt, image_bytes, mime=None,
                  model=SAM_MODEL, base_url=SAM_API_BASE,
                  timeout_s=SAM_TIMEOUT_S, include_confidence=True,
                  _post=None):
    """Run one SAM text prompt against one image (flag-gated).

    Returns {"records": [...], "warnings": [...]}. Raises SamError on
    any failure; the spike script maps that to an error cell, never
    to a detection verdict. _post injects the transport (tests only).
    """
    if not sam_enabled():
        raise SamError("SAM spike is disabled.", stage="request")
    if not isinstance(api_key, str) or not api_key:
        raise SamError("SAM needs an API key.", stage="request")
    if not isinstance(base_url, str) or not base_url.startswith(
            "https://"):
        raise SamError("SAM needs an https base URL.", stage="request")
    payload = build_image_payload(
        prompt=prompt, image_bytes=image_bytes, mime=mime, model=model,
        include_confidence=include_confidence)
    post = _post_json if _post is None else _post
    _, body = post(f"{base_url.rstrip('/')}/responses", payload,
                   api_key, timeout_s)
    text = extract_output_text(body)
    records, warnings = parse_lane(text)
    return {"records": records, "warnings": warnings}
