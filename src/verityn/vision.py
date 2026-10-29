"""Vision-assisted circuit ingestion (Snap & Build PoC).

A circuit photo or sketch goes to Muse Spark Vision, which proposes a
canvas-style circuit (components plus terminal connections). The
proposal is strictly validated and returned for learner inspection;
nothing model-proposed reaches the solver without explicit
confirmation, and this module never calls the solver itself.

Transport and envelope parsing are shared with the coach provider
(same endpoint, same JSON conventions); proposal validation is
vision-specific. All HTTP is mocked in tests. Live use needs an
explicitly authorized probe proving image support on the account,
since docs alone cannot confirm it.
"""

import base64
import binascii
import re

from verityn import meta_coach
from verityn.coach import CoachProviderError

VISION_MAX_IMAGE_BYTES = 4 * 1024 * 1024
VISION_MIME_TYPES = ("image/png", "image/jpeg", "image/webp")
VISION_MAX_COMPLETION_TOKENS = 2048

COMPONENT_TYPES = ("battery", "bulb", "switch")
TERMINALS = ("a", "b")
PROPOSAL_STATUSES = ("ready", "needs_review", "unsupported")
MAX_COMPONENTS = 16
MAX_CONNECTIONS = 24

ASSUMED_BATTERY_VOLTS = 6
ASSUMPTIONS = (
    "Battery voltage assumed 6 V — photos rarely state it.",
)

_ID = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,15}")

_PROPOSAL_JSON_SCHEMA = {
    "name": "vision_proposal",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "status": {"type": "string",
                        "enum": list(PROPOSAL_STATUSES)},
            "components": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string",
                                 "enum": list(COMPONENT_TYPES)},
                        # Strict subset: every property is required, so
                        # unknowns are explicit nulls, never missing keys.
                        # closed is null for non-switches and for
                        # switches whose state is not visible; polarity
                        # is null for non-batteries and for batteries
                        # whose terminals are not established.
                        "closed": {"type": ["boolean", "null"]},
                        "polarity": {
                            "type": ["object", "null"],
                            "properties": {
                                "positive": {"type": "string",
                                              "enum": ["a", "b"]},
                                "negative": {"type": "string",
                                              "enum": ["a", "b"]},
                            },
                            "required": ["positive", "negative"],
                            "additionalProperties": False,
                        },
                        "evidence": {
                            "type": "object",
                            "properties": {
                                "region_id": {"type": "string"},
                                "bounds": {
                                    "type": "object",
                                    "properties": {
                                        "x": {"type": "number"},
                                        "y": {"type": "number"},
                                        "width": {"type": "number"},
                                        "height": {"type": "number"},
                                    },
                                    "required": ["x", "y", "width", "height"],
                                    "additionalProperties": False,
                                },
                                "rotation": {"type": "number"},
                            },
                            "required": ["region_id", "bounds", "rotation"],
                            "additionalProperties": False,
                        },
                    },
                    "required": ["id", "type", "closed",
                                     "polarity", "evidence"],
                    "additionalProperties": False,
                },
            },
            "connections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "from": {
                            "type": "object",
                            "properties": {
                                "node": {"type": "string"},
                                "terminal": {"type": "string",
                                             "enum": ["a", "b"]},
                            },
                            "required": ["node", "terminal"],
                            "additionalProperties": False,
                        },
                        "to": {
                            "type": "object",
                            "properties": {
                                "node": {"type": "string"},
                                "terminal": {"type": "string",
                                             "enum": ["a", "b"]},
                            },
                            "required": ["node", "terminal"],
                            "additionalProperties": False,
                        },
                        "uncertain": {"type": "boolean"},
                        "evidence": {
                            "type": "object",
                            "properties": {
                                "region_id": {"type": "string"},
                            },
                            "required": ["region_id"],
                            "additionalProperties": False,
                        },
                    },
                    "required": ["from", "to", "uncertain", "evidence"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["status", "components", "connections"],
        "additionalProperties": False,
    },
}

_SYSTEM_PROMPT = (
    "You read a hand-drawn or printed circuit schematic and transcribe "
    "its parts and wiring. Reply with exactly one JSON object and no "
    "other text. Include status ready|needs_review|unsupported, "
    "components, and connections. Each component must include evidence "
    "with a stable region_id, normalized 0..1 bounds, and rotation. "
    "Every component includes closed and polarity keys: switches use "
    "closed true|false (null when the state is not visible), other "
    "parts use closed null. Batteries use polarity identifying "
    "positive and negative terminals (null when not visible), other "
    "parts use polarity null. Each connection must include "
    "evidence.region_id. Components use type battery|bulb|switch. "
    "Connections use from/to node plus terminal a|b and uncertain true "
    "when unsure. Mark status ready only when every connection is "
    "certain, every switch state is explicitly true or false, and "
    "every battery polarity is determined. Otherwise mark the proposal "
    "needs_review. Never invent missing information to obtain ready. "
    "Label each part's two terminals a and b consistently. "
    "When the topology cannot be safely reconstructed, use unsupported "
    "with empty components and connections. Never invent parts that are not visible."
)


class VisionRequestError(ValueError):
    """Client-side image problem (maps to HTTP 400)."""


def _rejected():
    return CoachProviderError("Vision proposal rejected.",
                              stage="validate")


def _finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_evidence(value, *, connection=False):
    if not isinstance(value, dict) or not isinstance(value.get("region_id"), str):
        raise _rejected()
    if connection:
        if set(value) != {"region_id"} or not value["region_id"].strip():
            raise _rejected()
        return {"region_id": value["region_id"]}
    if set(value) != {"region_id", "bounds", "rotation"}:
        raise _rejected()
    bounds = value.get("bounds")
    if not isinstance(bounds, dict) or set(bounds) != {"x", "y", "width", "height"}:
        raise _rejected()
    if not all(_finite_number(bounds[key]) for key in bounds):
        raise _rejected()
    x, y = bounds["x"], bounds["y"]
    width, height = bounds["width"], bounds["height"]
    if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < width <= 1 and
            0 < height <= 1 and x + width <= 1 and y + height <= 1):
        raise _rejected()
    rotation = value["rotation"]
    if not _finite_number(rotation) or not -180 <= rotation <= 180:
        raise _rejected()
    return {
        "region_id": value["region_id"],
        "bounds": {key: bounds[key] for key in ("x", "y", "width", "height")},
        "rotation": rotation,
    }


def parse_data_url(image):
    """Return the image data URL after strict validation."""
    if not isinstance(image, str) or not image.startswith("data:"):
        raise VisionRequestError("Invalid image payload.")
    header, sep, encoded = image.partition(",")
    if not sep:
        raise VisionRequestError("Invalid image payload.")
    parts = header.split(";")
    if len(parts) != 2 or parts[1] != "base64":
        raise VisionRequestError("Invalid image payload.")
    if parts[0][len("data:"):] not in VISION_MIME_TYPES:
        raise VisionRequestError("Invalid image payload.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise VisionRequestError("Invalid image payload.")
    if not 0 < len(raw) <= VISION_MAX_IMAGE_BYTES:
        raise VisionRequestError("Invalid image payload.")
    return image


def validate_proposal(output):
    """Return a canonical proposal dict, or raise CoachProviderError.

    Every check uses fixed rules and fixed messages: no model content
    can reach logs or learners through this path. Inputs are never
    mutated; the returned dict is rebuilt from validated values.
    """
    if not isinstance(output, dict):
        raise _rejected()
    components = output.get("components")
    connections = output.get("connections")
    status = output.get("status")
    if status not in PROPOSAL_STATUSES:
        raise _rejected()
    if not isinstance(components, list) or not isinstance(connections,
                                                          list):
        raise _rejected()
    if status == "unsupported" and (components or connections):
        raise _rejected()
    if status != "unsupported" and not 1 <= len(components) <= MAX_COMPONENTS:
        raise _rejected()
    if not 0 <= len(connections) <= MAX_CONNECTIONS:
        raise _rejected()
    seen = {}
    canon_components = []
    unknowns = 0
    for comp in components:
        if not isinstance(comp, dict):
            raise _rejected()
        cid = comp.get("id")
        ctype = comp.get("type")
        if not isinstance(cid, str) or _ID.fullmatch(cid) is None:
            raise _rejected()
        if ctype not in COMPONENT_TYPES:
            raise _rejected()
        if cid in seen:
            raise _rejected()
        # The strict schema requires every key; unknowns arrive as
        # explicit nulls, never as missing keys or silent defaults.
        if set(comp) != {"id", "type", "closed", "polarity",
                         "evidence"}:
            raise _rejected()
        evidence = _validate_evidence(comp.get("evidence"))
        entry = {"id": cid, "type": ctype, "evidence": evidence}
        closed = comp["closed"]
        if ctype == "switch":
            if not isinstance(closed, bool) and closed is not None:
                raise _rejected()
            if closed is None:
                unknowns += 1
        elif closed is not None:
            raise _rejected()
        entry["closed"] = closed
        polarity = comp["polarity"]
        if ctype == "battery":
            if polarity is None:
                unknowns += 1
            else:
                if (not isinstance(polarity, dict)
                        or set(polarity) != {"positive", "negative"}
                        or polarity["positive"] not in TERMINALS
                        or polarity["negative"] not in TERMINALS
                        or polarity["positive"] == polarity["negative"]):
                    raise _rejected()
                polarity = {
                    "positive": polarity["positive"],
                    "negative": polarity["negative"],
                }
        elif polarity is not None:
            raise _rejected()
        entry["polarity"] = polarity
        seen[cid] = ctype
        canon_components.append(entry)
    canon_connections = []
    pairs = set()
    for conn in connections:
        if not isinstance(conn, dict):
            raise _rejected()
        if set(conn) != {"from", "to", "uncertain"}:
            if set(conn) != {"from", "to", "uncertain", "evidence"}:
                raise _rejected()
        if "evidence" not in conn:
            raise _rejected()
        if not isinstance(conn["uncertain"], bool):
            raise _rejected()
        evidence = _validate_evidence(conn["evidence"], connection=True)
        ends = []
        for key in ("from", "to"):
            end = conn[key]
            if not isinstance(end, dict):
                raise _rejected()
            if set(end) != {"node", "terminal"}:
                raise _rejected()
            node = end["node"]
            if not isinstance(node, str) or node not in seen:
                raise _rejected()
            if end["terminal"] not in TERMINALS:
                raise _rejected()
            ends.append((node, end["terminal"]))
        if ends[0] == ends[1]:
            raise _rejected()
        pair = frozenset(ends)
        if pair in pairs:
            raise _rejected()
        pairs.add(pair)
        canon_connections.append({
            "from": {"node": ends[0][0], "terminal": ends[0][1]},
            "to": {"node": ends[1][0], "terminal": ends[1][1]},
            "uncertain": conn["uncertain"],
            "evidence": evidence,
        })
    uncertain = any(conn["uncertain"] for conn in canon_connections)
    if status == "ready" and (uncertain or unknowns):
        raise _rejected()
    if status == "needs_review" and not uncertain and not unknowns:
        raise _rejected()
    return {"status": status, "components": canon_components,
            "connections": canon_connections}


class MetaVisionProvider:
    """Muse Spark vision provider. Tests mock the transport."""

    name = "meta-spark"

    def __init__(self, api_key, model=meta_coach.META_MODEL,
                 base_url=meta_coach.META_API_BASE,
                 timeout_s=meta_coach.META_TIMEOUT_S):
        if not api_key:
            raise ValueError("Meta API key missing.")
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def propose(self, data_url):
        """Return a validated circuit proposal for a data-URL image."""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": [
                    {"type": "text",
                     "text": "Transcribe this circuit schematic."},
                    {"type": "image_url",
                     "image_url": {"url": data_url}},
                ]},
            ],
            "temperature": 0,
            "reasoning_effort": "minimal",
            "max_completion_tokens": VISION_MAX_COMPLETION_TOKENS,
            "response_format": {"type": "json_schema",
                                "json_schema": _PROPOSAL_JSON_SCHEMA},
        }
        headers = {"Content-Type": "application/json",
                   "Authorization": f"Bearer {self.api_key}"}
        _, body = meta_coach._post_json(
            f"{self.base_url}/chat/completions", payload, headers,
            self.timeout_s)
        return validate_proposal(
            meta_coach._parse_output(meta_coach._chat_content(body)))
