"""Verityn backend.

Deterministic Flask layer over src/verityn/: solver and evaluator
outcomes remain local; coach, vision, and voice providers are configured
separately. Voice audio is forwarded to Meta only after a learner starts
a microphone recording. Stack traces never leave the server.
"""

import math
import os
import sys
import time
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import BadRequest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from verityn import coach, evaluator, fake_coach, meta_coach, meta_voice, solver, trace, vision  # noqa: E402

MALFORMED_REQUEST = "MALFORMED_REQUEST"
# Recordings are 24 kHz mono 16-bit WAV: 30 s peaks near 1.44 MB, so
# 2 MB admits the longest honest clip (~40 s) with framing headroom.
MAX_VOICE_BYTES = 2 * 1024 * 1024
MAX_COACH_MESSAGE_CHARS = 500
MIN_BATTERY_VOLTS = 0.1
MAX_BATTERY_VOLTS = 24.0
MIN_OHMS = 0.1
MAX_OHMS = 1_000_000.0
MIN_RATED_VOLTS = 0.1
MAX_RATED_VOLTS = 24.0
MIN_SAFE_WATTS = 0.1
MAX_SAFE_WATTS = 1000.0


def _in_range(value, low, high):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        numeric = float(value)
    except OverflowError:
        return False
    return math.isfinite(numeric) and low <= numeric <= high


def _numeric_range_error(netlist):
    if not isinstance(netlist, dict):
        return None
    comps = netlist.get("components")
    if not isinstance(comps, list):
        return None
    for item in comps:
        if not isinstance(item, dict):
            continue
        ctype = item.get("type")
        cid = item.get("id")
        if ctype == "battery" and "volts" in item \
                and not _in_range(item["volts"], MIN_BATTERY_VOLTS, MAX_BATTERY_VOLTS):
            return (f"Battery '{cid}' volts must be finite "
                    f"{MIN_BATTERY_VOLTS} to {MAX_BATTERY_VOLTS} V.")
        if ctype == "resistor" and "ohms" in item \
                and not _in_range(item["ohms"], MIN_OHMS, MAX_OHMS):
            return (f"Resistor '{cid}' ohms must be finite "
                    f"{MIN_OHMS} to {MAX_OHMS}.")
        if ctype == "bulb":
            if "rated_volts" in item and not _in_range(
                    item["rated_volts"], MIN_RATED_VOLTS, MAX_RATED_VOLTS):
                return (f"Bulb '{cid}' rated_volts must be finite "
                        f"{MIN_RATED_VOLTS} to {MAX_RATED_VOLTS} V.")
            if "max_safe_watts" in item and not _in_range(
                    item["max_safe_watts"], MIN_SAFE_WATTS, MAX_SAFE_WATTS):
                return (f"Bulb '{cid}' max_safe_watts must be finite "
                        f"{MIN_SAFE_WATTS} to {MAX_SAFE_WATTS} W.")
    return None


def _elapsed_ms(start):
    return int(round((time.perf_counter() - start) * 1000))


def _provider_failure(err, *, feature, tool):
    """Map provider failures to stable, actionable API errors."""
    if err.http_status == 429:
        code, message, status = "RATE_LIMITED", "The live provider is rate limited. Try again shortly.", 429
    elif err.http_status == 401:
        code, message, status = "MISSING_KEY", "The live provider credential is missing or was rejected.", 503
    elif err.stage == "transport" and err.reason == "timeout":
        code, message, status = "PROVIDER_TIMEOUT", "The live provider timed out. Try again shortly.", 502
    elif err.stage == "transport":
        code, message, status = "PROVIDER_UNAVAILABLE", "The live provider is unavailable. Use a verified sample or try again.", 502
    elif err.stage in ("parse", "validate"):
        code, message, status = "INVALID_PROPOSAL" if feature == "vision" else "INVALID_PROVIDER_RESPONSE", "The live provider returned an unusable response. Use a verified sample or try again.", 502
    else:
        code, message, status = "PROVIDER_UNAVAILABLE", "The live provider is unavailable. Try again shortly.", 502
    if feature == "vision" and err.http_status != 429:
        status = 500
    return jsonify({
        "error_code": code,
        "error_message": message,
        "trace": trace.rejection_trace(
            tool=tool,
            input_kind="image" if feature == "vision" else "text",
            output_kind="proposal" if feature == "vision" else "conversation-reply",
            reason=err.reason or err.stage,
            ms=0),
    }), status


def _tool_for(serving, primary, fallback=None):
    """Display id for a serving provider: model id when Meta, else its name."""
    for candidate in (primary, fallback):
        if candidate is not None and serving == candidate.name:
            return getattr(candidate, "model", serving)
    return serving


def _result_to_dict(result):
    return {
        "ok": result.ok,
        "node_voltages": result.node_voltages,
        "components": result.components,
        "error_code": result.error_code,
        "error_message": result.error_message,
        "component_ids": result.component_ids,
        "conditions": result.conditions,
        "ratings": result.ratings,
    }


def _verdict_to_dict(verdict):
    return {
        "status": verdict.status,
        "reason": verdict.reason,
        "evidence": verdict.evidence,
    }


def _read_json_object():
    """Parse the body, or return None when it is not a JSON object."""
    try:
        body = request.get_json(force=True)
    except BadRequest:
        return None
    return body if isinstance(body, dict) else None


def _malformed_request(message):
    return jsonify({
        "ok": False,
        "node_voltages": {},
        "components": {},
        "error_code": MALFORMED_REQUEST,
        "error_message": message,
        "component_ids": [],
    }), 400


def create_app(provider=None, fallback=None, vision_provider=None,
               voice_provider=None) -> Flask:
    app = Flask(__name__)

    def _quiet_log_exception(exc_info):
        # Fixed line only: tracebacks, messages, and request details
        # must never reach logs or clients. Local debugging uses tests.
        app.logger.error("unhandled error; fixed response returned")

    app.log_exception = _quiet_log_exception
    store = coach.SessionStore()
    active_provider = provider or fake_coach.FakeCoachProvider()
    active_fallback = fallback
    active_vision = vision_provider
    active_voice = voice_provider

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.post("/api/simulate")
    def simulate():
        body = _read_json_object()
        if body is None:
            return _malformed_request("Request body must be a JSON object.")
        range_error = _numeric_range_error(body)
        if range_error is not None:
            return _malformed_request(range_error)
        return jsonify(_result_to_dict(solver.solve(body)))

    @app.post("/api/evaluate")
    def evaluate_claim():
        body = _read_json_object()
        if body is None or "claim" not in body or "netlist" not in body:
            return jsonify({
                "result": None,
                "verdict": None,
                "error_code": MALFORMED_REQUEST,
                "error_message": "Request body must be a JSON object "
                                 "with 'claim' and 'netlist'.",
            }), 400
        range_error = _numeric_range_error(body["netlist"])
        if range_error is not None:
            return jsonify({
                "result": None,
                "verdict": None,
                "error_code": MALFORMED_REQUEST,
                "error_message": range_error,
            }), 400
        result = solver.solve(body["netlist"])
        verdict = evaluator.evaluate(body["claim"], body["netlist"], result)
        return jsonify({
            "result": _result_to_dict(result),
            "verdict": _verdict_to_dict(verdict),
        })

    @app.post("/api/coach/predict")
    def coach_predict():
        body = _read_json_object()
        if body is None:
            return _malformed_request("Request body must be a JSON object.")
        try:
            session_id = store.record_prediction(
                body.get("challenge_id"),
                body.get("choice"),
                body.get("why", ""),
                body.get("session_id"),
            )
        except coach.CoachValidationError as err:
            return _malformed_request(str(err))
        return jsonify({
            "session_id": session_id,
            "challenge_id": body.get("challenge_id"),
            "choice": body.get("choice"),
        })

    @app.post("/api/coach/ask")
    def coach_ask():
        body = _read_json_object()
        if body is None:
            return _malformed_request("Request body must be a JSON object.")
        session_id = body.get("session_id")
        netlist = body.get("netlist")
        rung = body.get("rung", "R1")
        if not isinstance(session_id, str) or not isinstance(netlist, dict):
            return _malformed_request(
                "Request needs a session id string and a netlist object.")
        if rung not in coach.VALID_RUNGS:
            return _malformed_request(
                "Rung must be one of R1, R2, R4.")
        range_error = _numeric_range_error(netlist)
        if range_error is not None:
            return _malformed_request(range_error)
        start = time.perf_counter()
        response = coach.derive_eligibility(
            store, session_id, netlist, active_provider,
            fallback=active_fallback, rung=rung)
        if response.get("eligible") is True:
            serving = response["provider"]
            response["trace"] = trace.build_trace(
                tool=_tool_for(serving, active_provider, active_fallback),
                input_kind="text", output_kind="structured-hint",
                serving=serving, primary=active_provider.name,
                ms=_elapsed_ms(start),
                failed_stage=response.get("primary_error"),
                attempts=response.get("attempts", 1))
        return jsonify(response)

    @app.post("/api/coach/conversation")
    def coach_conversation():
        body = _read_json_object()
        if body is None:
            return _malformed_request("Request body must be a JSON object.")
        message = body.get("message")
        if (not isinstance(message, str) or not message.strip()
                or len(message) > MAX_COACH_MESSAGE_CHARS):
            return _malformed_request(
                f"Message must contain 1 to {MAX_COACH_MESSAGE_CHARS} characters.")
        context = body.get("context", "")
        if not isinstance(context, str) or len(context) > MAX_COACH_MESSAGE_CHARS:
            return _malformed_request(
                f"Context must contain at most {MAX_COACH_MESSAGE_CHARS} characters.")
        start = time.perf_counter()
        failed_stage = None
        try:
            reply = active_provider.conversation_reply(message.strip(), context)
            reply_provider = active_provider.name
        except coach.CoachProviderError as err:
            if active_fallback is None:
                app.logger.warning(
                    "coach conversation failed: stage=%s http_status=%s "
                    "shape=%s reason=%s",
                    err.stage, err.http_status, err.shape, err.reason)
                return _provider_failure(err, feature="coach", tool=_tool_for(active_provider.name, active_provider, active_fallback))
            failed_stage = err.stage
            try:
                reply = active_fallback.conversation_reply(message.strip(), context)
                reply_provider = active_fallback.name
            except coach.CoachProviderError as fallback_error:
                app.logger.warning(
                    "coach conversation fallback failed: stage=%s",
                    fallback_error.stage)
                return _provider_failure(fallback_error, feature="coach", tool=_tool_for(active_fallback.name, active_provider, active_fallback))
        return jsonify({
            "reply": reply,
            "provider": reply_provider,
            "trace": trace.build_trace(
                tool=_tool_for(reply_provider, active_provider,
                               active_fallback),
                input_kind="text", output_kind="conversation-reply",
                serving=reply_provider, primary=active_provider.name,
                ms=_elapsed_ms(start), failed_stage=failed_stage),
        })

    @app.post("/api/coach/explain")
    def coach_explain():
        body = _read_json_object()
        if body is None:
            return _malformed_request("Request body must be a JSON object.")
        netlist = body.get("netlist")
        if not isinstance(netlist, dict):
            return _malformed_request("Request needs a netlist object.")
        range_error = _numeric_range_error(netlist)
        if range_error is not None:
            return _malformed_request(range_error)
        start = time.perf_counter()
        response = coach.explain_result(
            netlist, active_provider, fallback=active_fallback)
        serving = response["provider"]
        response["trace"] = trace.build_trace(
            tool=_tool_for(serving, active_provider, active_fallback),
            input_kind="text", output_kind="structured-explanation",
            serving=serving, primary=active_provider.name,
            ms=_elapsed_ms(start),
            failed_stage=response.get("primary_error"))
        return jsonify(response)

    @app.post("/api/vision/propose")
    def vision_propose():
        body = _read_json_object()
        if body is None:
            return _malformed_request("Request body must be a JSON object.")
        if active_vision is None:
            return jsonify({"error_code": "INTERNAL_ERROR",
                            "error_message": "Vision unavailable."}), 500
        try:
            data_url = vision.parse_data_url(body.get("image"))
        except vision.VisionRequestError:
            return _malformed_request("Invalid image payload.")
        start = time.perf_counter()
        tool = getattr(active_vision, "model", active_vision.name)
        try:
            proposal = active_vision.propose(data_url)
        except coach.CoachProviderError as err:
            app.logger.warning(
                "vision propose failed: stage=%s http_status=%s "
                "shape=%s reason=%s",
                err.stage, err.http_status, err.shape, err.reason)
            return _provider_failure(err, feature="vision", tool=tool)
        return jsonify({"proposal": proposal,
                        "assumptions": vision.ASSUMPTIONS,
                        "provider": active_vision.name,
                        "trace": trace.build_trace(
                            tool=tool, input_kind="image",
                            output_kind="proposal",
                            serving=active_vision.name,
                            primary=active_vision.name,
                            ms=_elapsed_ms(start))})

    @app.post("/api/voice/transcribe")
    def voice_transcribe():
        if active_voice is None:
            return jsonify({
                "error_code": "VOICE_UNAVAILABLE",
                "error_message": "Muse Voice Transcribe is not configured.",
            }), 503
        audio_file = request.files.get("audio")
        if audio_file is None:
            return jsonify({
                "error_code": MALFORMED_REQUEST,
                "error_message": "Upload a WAV recording in the audio field.",
            }), 400
        if request.content_length is not None and request.content_length > MAX_VOICE_BYTES:
            return jsonify({
                "error_code": "VOICE_TOO_LARGE",
                "error_message": "The recording is too large to transcribe.",
            }), 413
        audio = audio_file.read(MAX_VOICE_BYTES + 1)
        if len(audio) > MAX_VOICE_BYTES:
            return jsonify({
                "error_code": "VOICE_TOO_LARGE",
                "error_message": "The recording is too large to transcribe.",
            }), 413
        if not audio.startswith(b"RIFF") or audio[8:12] != b"WAVE":
            return jsonify({
                "error_code": MALFORMED_REQUEST,
                "error_message": "The recording must be a WAV audio file.",
            }), 400
        seconds = meta_voice.wav_seconds(audio)
        start = time.perf_counter()
        tool = getattr(active_voice, "model", "voice-transcribe")
        try:
            transcript = active_voice.transcribe(audio)
        except meta_voice.VoiceTranscriptionError as err:
            app.logger.warning("voice transcribe failed: http_status=%s",
                               err.status)
            if err.status == 429:
                return jsonify({"error_code": "RATE_LIMITED", "error_message": "Voice transcription is rate limited. Try again shortly."}), 429
            if err.status == 401:
                return jsonify({"error_code": "MISSING_KEY", "error_message": "The voice provider credential is missing or was rejected."}), 503
            if str(err) == "Muse Voice Transcribe is temporarily unavailable.":
                return jsonify({"error_code": "PROVIDER_TIMEOUT", "error_message": "Voice transcription timed out. Try again shortly."}), 502
            return jsonify({"error_code": "PROVIDER_UNAVAILABLE", "error_message": str(err)}), 503
        return jsonify({
            "transcript": transcript,
            "source": "meta-voice-transcribe",
            "seconds": seconds,
            "trace": trace.build_trace(
                tool=tool, input_kind="audio", output_kind="transcript",
                serving="meta-voice", primary="meta-voice",
                ms=_elapsed_ms(start), decided_by="none"),
        })

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error_code": "NOT_FOUND",
                        "error_message": "Unknown route."}), 404

    @app.errorhandler(405)
    def method_not_allowed(_error):
        return jsonify({"error_code": "METHOD_NOT_ALLOWED",
                        "error_message": "Method not allowed."}), 405

    @app.errorhandler(500)
    def internal_error(_error):
        return jsonify({"error_code": "INTERNAL_ERROR",
                        "error_message": "Unexpected server error."}), 500

    return app


app = create_app()


def _load_dotenv(path=None):
    """Load repo-root .env into os.environ; exported values win."""
    if path is None:
        path = Path(__file__).resolve().parent.parent / ".env"
    try:
        lines = path.read_text().splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def _resolve_port() -> int:
    """Local port for `python backend/app.py`; VERITYN_PORT overrides 5000."""
    try:
        return int(os.environ.get("VERITYN_PORT", "5000"))
    except ValueError:
        return 5000


if __name__ == "__main__":
    _load_dotenv()
    # Test-only switch for the provider-failure path; never set it live.
    if os.environ.get("VERITYN_COACH_FAIL") == "1":
        app = create_app(fake_coach.FakeCoachProvider(fail=True))
    elif os.environ.get("MODEL_API_KEY"):
        app = create_app(
            meta_coach.MetaSparkProvider(
                api_key=os.environ["MODEL_API_KEY"]),
            fallback=fake_coach.FakeCoachProvider(),
            vision_provider=vision.MetaVisionProvider(
                api_key=os.environ["MODEL_API_KEY"]),
            voice_provider=meta_voice.MetaVoiceTranscriber(
                api_key=os.environ["MODEL_API_KEY"]),
        )
    # Debug mode stays off: the interactive debugger must never run.
    app.run(host="127.0.0.1", port=_resolve_port(), debug=False)
