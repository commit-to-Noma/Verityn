"""Real coaching provider (M9a): Meta Spark behind CoachProvider.

Uses the user-verified base URL and model id only. Structured output
is requested as strict JSON and validated before anything reaches the
learner: unknown misconception ids downgrade to "unclear"; malformed
output, non-questions, numbers outside the solver facts, and
answer-leak phrases all raise CoachProviderError, which routes to the
template fallback (or HTTP 500 when no fallback is configured).

Error messages are fixed strings: they never include the API key or
model output.

Chat-shape note: requests follow the documented OpenAI-compatible
chat-completions convention at {base}/chat/completions. Response
parsing is isolated in _chat_content so a shape mismatch surfaces in
exactly one place during the first authorized live call.
"""

import json
import re
import urllib.error
import urllib.request

from verityn.coach import CoachProviderError, find_leak

META_API_BASE = "https://api.meta.ai/v1"
META_MODEL = "muse-spark-1.3"
META_TIMEOUT_S = 10
META_MAX_COMPLETION_TOKENS = 1024
META_REASONING_EFFORT = "minimal"

MISCONCEPTION_IDS = (
    "open_switch_conducts",
    "partial_loop_conducts",
    "battery_forces_current",
    "unclear",
)

# Constrained-output contract for the R1 question. Mirrors exactly what
# validate_model_output accepts: a closed id enum plus a question string.
# Sent as Chat Completions response_format json_schema (OpenAI-compatible
# shape); strict validation still runs on every response.
_R1_JSON_SCHEMA = {
    "name": "coach_r1",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "misconception_id": {"type": "string",
                                 "enum": list(MISCONCEPTION_IDS)},
            "question": {"type": "string"},
        },
        "required": ["misconception_id", "question"],
        "additionalProperties": False,
    },
}

_NUMBER = re.compile(r"[+-]?\d+(?:\.\d+)?")
_PART_ID = re.compile(r"[A-Za-z]+\d+")
_SAFE_CHARS = re.compile(r"[^a-zA-Z0-9_,\-\[\]=]")


def describe_shape(value):
    """Sketch a response fragment's structure: kinds and key names only.

    Never includes values, so the result is safe to log. Key names are
    scrubbed to a small alphabet and truncated.
    """
    if isinstance(value, dict):
        keys = ",".join(sorted(str(key) for key in value))[:160]
        return f"dict[{_SAFE_CHARS.sub('?', keys)}]"
    if isinstance(value, list):
        kinds = ",".join(sorted({type(item).__name__ for item in value[:5]}))
        return f"list[{kinds}]len={len(value)}"
    if isinstance(value, str):
        return f"str[len={len(value)}]"
    return type(value).__name__

_SYSTEM_PROMPT = (
    "You help a student reason about a simple battery-bulb-switch circuit. "
    "The student predicted an outcome, built the circuit, and the simulator "
    "contradicted them. Ask exactly one short guiding question that points "
    "at the flaw in their reasoning. Never state whether the bulb lights, "
    "never give numbers, and never give wiring instructions or the fix. "
    "Reply with exactly one JSON object and no other text: "
    '{"misconception_id": "<one id>", "question": "<your question>"}. '
    "misconception_id must be one of: " + ", ".join(MISCONCEPTION_IDS) + "."
)


def _user_message(choice, why, facts):
    predicted = ("the bulb will light" if choice == "yes"
                 else "the bulb will stay dark")
    return (
        f"The student predicted {predicted}.\n"
        f"The student's own words: {why}\n"
        f"Solver facts (per part): {json.dumps(facts, sort_keys=True)}\n"
        "Which misconception best fits, and what one question guides them?"
    )


def _numbers_outside_facts(text, facts):
    scrubbed = _PART_ID.sub(" ", text)
    values = [float(value) for value in facts.values()]
    bad = []
    for match in _NUMBER.findall(scrubbed):
        number = float(match)
        if not any(abs(number - value) <= 1e-9 for value in values):
            bad.append(match)
    return bad


def validate_model_output(output, facts):
    """Return (diagnosis, question) or raise CoachProviderError."""
    if not isinstance(output, dict):
        raise CoachProviderError("Meta output malformed.", stage="parse",
                                 shape=describe_shape(output))
    raw_id = output.get("misconception_id")
    question = output.get("question")
    if not isinstance(question, str) or not question.strip().endswith("?"):
        raise CoachProviderError("Meta output rejected.", stage="validate",
                                 reason="not-question")
    cleaned = question.strip()
    if find_leak(cleaned) is not None:
        raise CoachProviderError("Meta output rejected.", stage="validate",
                                 reason="leak")
    if _numbers_outside_facts(cleaned, facts):
        raise CoachProviderError("Meta output rejected.", stage="validate",
                                 reason="number")
    diagnosis = raw_id if raw_id in MISCONCEPTION_IDS else "unclear"
    return diagnosis, cleaned


def _post_json(url, payload, headers, timeout_s):
    data = json.dumps(payload).encode()
    request = urllib.request.Request(url, data=data, headers=headers,
                                     method="POST")
    try:
        with urllib.request.urlopen(request,
                                    timeout=timeout_s) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as err:
        # The server answered: an HTTP rejection (e.g. 400), not a
        # transport failure. The response body is never read or logged.
        raise CoachProviderError(
            f"Meta request failed (HTTP {err.code}).",
            stage="http", http_status=err.code) from err
    except TimeoutError as err:
        raise CoachProviderError("Meta request timed out.",
                                 stage="transport") from err
    except urllib.error.URLError as err:
        raise CoachProviderError("Meta request failed.",
                                 stage="transport") from err
    try:
        return status, json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        raise CoachProviderError("Meta response malformed.", stage="parse",
                                 shape=f"bytes[len={len(raw)}]") from err


def _chat_content(payload):
    try:
        choices = payload["choices"]
        content = choices[0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as err:
        raise CoachProviderError("Meta response malformed.", stage="parse",
                                 shape=describe_shape(payload)) from err
    if not isinstance(content, str):
        shape = f"content:{describe_shape(content)}"
        message = choices[0]["message"]
        if isinstance(message, dict):
            shape += f",msg:{describe_shape(message)}"
        raise CoachProviderError("Meta response malformed.", stage="parse",
                                 shape=shape)
    return content


_FINISH_REASONS = ("stop", "length", "content_filter", "refusal",
                   "tool_calls", "function_call")


def _finish_reason(body):
    """Allowlisted finish_reason, else "other". Never returns raw values."""
    if not isinstance(body, dict):
        return "other"
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        return "other"
    first = choices[0]
    if not isinstance(first, dict):
        return "other"
    reason = first.get("finish_reason")
    return reason if reason in _FINISH_REASONS else "other"


def _completion_tokens(body):
    """completion_tokens when a valid non-negative int, else None."""
    if not isinstance(body, dict):
        return None
    usage = body.get("usage")
    if not isinstance(usage, dict):
        return None
    tokens = usage.get("completion_tokens")
    if isinstance(tokens, bool) or not isinstance(tokens, int) or tokens < 0:
        return None
    return tokens


def _with_completion(shape, body):
    """Append safe completion metadata to a parse-failure sketch."""
    shape = f"{shape},finish={_finish_reason(body)}"
    tokens = _completion_tokens(body)
    if tokens is not None:
        shape = f"{shape},ctoks={tokens}"
    return shape


def _parse_output(content):
    text = content.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    has_braces = "yes" if start >= 0 and end > start else "no"
    shape = f"str[len={len(text)},braces={has_braces}]"
    if start < 0 or end <= start:
        raise CoachProviderError("Meta response malformed.", stage="parse",
                                 shape=shape)
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as err:
        raise CoachProviderError("Meta response malformed.", stage="parse",
                                 shape=shape) from err


class MetaSparkProvider:
    """Meta Spark coaching provider. Tests mock the transport."""

    name = "meta-spark"

    def __init__(self, api_key, model=META_MODEL, base_url=META_API_BASE,
                 timeout_s=META_TIMEOUT_S):
        if not api_key:
            raise ValueError("Meta API key missing.")
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def r1_question(self, *, choice, why, facts=None):
        if facts is None:
            raise CoachProviderError("Missing solver facts.",
                                     stage="internal")
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",
                 "content": _user_message(choice, why, facts)},
            ],
            "temperature": 0,
            "reasoning_effort": META_REASONING_EFFORT,
            "max_completion_tokens": META_MAX_COMPLETION_TOKENS,
            "response_format": {"type": "json_schema",
                                "json_schema": _R1_JSON_SCHEMA},
        }
        headers = {"Content-Type": "application/json",
                   "Authorization": f"Bearer {self.api_key}"}
        _, body = _post_json(f"{self.base_url}/chat/completions", payload,
                             headers, self.timeout_s)
        try:
            _, question = validate_model_output(
                _parse_output(_chat_content(body)), facts)
        except CoachProviderError as err:
            if err.stage == "parse" and ",finish=" not in (err.shape or ""):
                err.shape = _with_completion(err.shape or "unknown", body)
            raise
        return question
