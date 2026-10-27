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
            "components": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string",
                                 "enum": list(COMPONENT_TYPES)},
                        "closed": {"type": "boolean"},
                    },
                    "required": ["id", "type"],
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
                    },
                    "required": ["from", "to", "uncertain"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["components", "connections"],
        "additionalProperties": False,
    },
}

_SYSTEM_PROMPT = (
    "You read a hand-drawn or printed circuit schematic and transcribe "
    "its parts and wiring. Reply with exactly one JSON object and no "
    "other text: components (id, type battery|bulb|switch, closed for "
    "switches) and connections (from/to node plus terminal a|b, and "
    "uncertain true when unsure). Label each part's two terminals a "
    "and b consistently. When a connection is unclear, include your "
    "best reading with uncertain true rather than omitting it. Never "
    "invent parts that are not visible."
)


class VisionRequestError(ValueError):
    """Client-side image problem (maps to HTTP 400)."""


def _rejected():
    return CoachProviderError("Vision proposal rejected.",
                              stage="validate")


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
    if not isinstance(components, list) or not isinstance(connections,
                                                          list):
        raise _rejected()
    if not 1 <= len(components) <= MAX_COMPONENTS:
        raise _rejected()
    if not 0 <= len(connections) <= MAX_CONNECTIONS:
        raise _rejected()
    seen = {}
    canon_components = []
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
        if set(comp) - {"id", "type", "closed"}:
            raise _rejected()
        entry = {"id": cid, "type": ctype}
        if ctype == "switch":
            if not isinstance(comp.get("closed"), bool):
                raise _rejected()
            entry["closed"] = comp["closed"]
        elif "closed" in comp:
            raise _rejected()
        seen[cid] = ctype
        canon_components.append(entry)
    canon_connections = []
    pairs = set()
    for conn in connections:
        if not isinstance(conn, dict):
            raise _rejected()
        if set(conn) != {"from", "to", "uncertain"}:
            raise _rejected()
        if not isinstance(conn["uncertain"], bool):
            raise _rejected()
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
        })
    return {"components": canon_components, "connections": canon_connections}


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
