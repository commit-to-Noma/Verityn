"""Verityn backend.

Milestones 1-4: health, circuit simulation, and prediction evaluation.
Deterministic Flask layer over src/verityn/: no AI, no network calls,
no sessions. Judged outcomes always return HTTP 200; only malformed
requests return HTTP 400, and unknown routes or methods return JSON
errors. Stack traces never leave the server.
"""

import sys
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import BadRequest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from verityn import evaluator, solver  # noqa: E402

MALFORMED_REQUEST = "MALFORMED_REQUEST"


def _result_to_dict(result):
    return {
        "ok": result.ok,
        "node_voltages": result.node_voltages,
        "components": result.components,
        "error_code": result.error_code,
        "error_message": result.error_message,
        "component_ids": result.component_ids,
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


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.post("/api/simulate")
    def simulate():
        body = _read_json_object()
        if body is None:
            return _malformed_request("Request body must be a JSON object.")
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
        result = solver.solve(body["netlist"])
        verdict = evaluator.evaluate(body["claim"], body["netlist"], result)
        return jsonify({
            "result": _result_to_dict(result),
            "verdict": _verdict_to_dict(verdict),
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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
