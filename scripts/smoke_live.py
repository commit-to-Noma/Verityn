"""End-to-end live smoke check for the judging path.

Launches the real Flask app on an ephemeral port (no credits: model keys
are scrubbed from the environment) and verifies:
health -> simulate -> R1 -> R2 -> R4 -> solo with zero coach calls.

Usage (venv active, from the repo root):
    python scripts/smoke_live.py
"""

import json
import os
import sys
import threading
import urllib.error
import urllib.request

# Never spend credits: the smoke path must serve the deterministic providers.
os.environ.pop("MODEL_API_KEY", None)
os.environ.pop("VERITYN_COACH_FAIL", None)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))
sys.path.insert(0, os.path.join(ROOT, "src"))

from app import create_app  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402

L1_FIXED = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "B1.a", "b": "B1.b"},
    {"id": "S1", "type": "switch", "closed": True, "a": "S1.a", "b": "S1.b"},
    {"id": "L1", "type": "bulb", "a": "L1.a", "b": "L1.b"},
    {"id": "W1", "type": "wire", "a": "B1.a", "b": "S1.a"},
    {"id": "W2", "type": "wire", "a": "S1.b", "b": "L1.a"},
    {"id": "W3", "type": "wire", "a": "B1.b", "b": "L1.b"},
]}

TWIST_FIXED = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "B1.a", "b": "B1.b"},
    {"id": "S1", "type": "switch", "closed": False, "a": "S1.a", "b": "S1.b"},
    {"id": "L1", "type": "bulb", "a": "L1.a", "b": "L1.b"},
    {"id": "W1", "type": "wire", "a": "B1.a", "b": "S1.a"},
    {"id": "W2", "type": "wire", "a": "S1.b", "b": "L1.a"},
    {"id": "W3", "type": "wire", "a": "B1.b", "b": "L1.b"},
]}

SOLO_FIXED = {"components": [
    {"id": "B1", "type": "battery", "volts": 6, "a": "B1.a", "b": "B1.b"},
    {"id": "S1", "type": "switch", "closed": True, "a": "S1.a", "b": "S1.b"},
    {"id": "L1", "type": "bulb", "a": "L1.a", "b": "L1.b"},
    {"id": "W1", "type": "wire", "a": "B1.a", "b": "S1.a"},
    {"id": "W2", "type": "wire", "a": "S1.b", "b": "L1.a"},
    {"id": "W3", "type": "wire", "a": "L1.b", "b": "B1.b"},
    {"id": "L2", "type": "bulb", "a": "L2.a", "b": "L2.b"},
    {"id": "W4", "type": "wire", "a": "L2.a", "b": "L1.a"},
    {"id": "W5", "type": "wire", "a": "L2.b", "b": "L1.b"},
]}


class SmokeFailure(Exception):
    pass


def main():
    app = create_app()
    coach_hits = []

    inner = app.wsgi_app

    def counting_app(environ, start_response):
        if environ.get("PATH_INFO", "").startswith("/api/coach/"):
            coach_hits.append(environ["PATH_INFO"])
        return inner(environ, start_response)

    app.wsgi_app = counting_app
    server = make_server("127.0.0.1", 0, app)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"

    def check(name, cond, extra=""):
        print(("PASS " if cond else "FAIL ") + name, extra)
        if not cond:
            raise SmokeFailure(name)

    def get(path):
        with urllib.request.urlopen(base + path, timeout=10) as resp:
            return resp.status, json.loads(resp.read())

    def post(path, body):
        req = urllib.request.Request(
            base + path,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    try:
        status, health = get("/api/health")
        check("health", status == 200 and health.get("status") == "ok", health)

        status, sim = post("/api/simulate", L1_FIXED)
        lamp = sim["components"]["L1"]
        check("L1 fixed solves lit", sim["ok"] is True
              and abs(lamp["current"] - 0.6) < 1e-6
              and abs(lamp["power"] - 3.6) < 1e-6, lamp)

        status, pred = post("/api/coach/predict", {
            "challenge_id": "L1T1", "choice": "yes", "why": "smoke",
        })
        check("twist prediction recorded", status == 200 and "session_id" in pred, pred)
        sid = pred["session_id"]

        def ask(rung):
            return post("/api/coach/ask", {
                "session_id": sid, "netlist": TWIST_FIXED, "rung": rung,
            })

        status, out = ask("R2")
        check("R2-first refused in order", out.get("reason_code") == "RUNG_OUT_OF_ORDER", out)
        status, r1 = ask("R1")
        check("R1 eligible, no live call",
              r1.get("eligible") is True and r1.get("rung") == "R1"
              and r1.get("provider") == "prototype-fake", r1.get("provider"))
        status, out = ask("R4")
        check("R4-before-R2 refused", out.get("reason_code") == "RUNG_OUT_OF_ORDER", out)
        status, r2 = ask("R2")
        check("R2 deterministic evidence pointer",
              r2.get("eligible") is True and r2.get("rung") == "R2"
              and r2.get("provider") == "deterministic"
              and "0.0 A" in r2.get("text", "") and "S1" in r2.get("text", ""),
              r2.get("text", "")[:80])
        status, r4 = ask("R4")
        check("R4 deterministic confirmation",
              r4.get("eligible") is True and r4.get("rung") == "R4"
              and r4.get("provider") == "deterministic", r4.get("rung"))
        check("coached phase made 6 coach calls (predict + R2 R1 R4 R2 R4)",
              len(coach_hits) == 6, len(coach_hits))

        del coach_hits[:]
        status, sim = post("/api/simulate", SOLO_FIXED)
        lamp2 = sim["components"]["L2"]
        check("solo fixed solves lit", sim["ok"] is True
              and abs(lamp2["current"] - 0.6) < 1e-6
              and abs(lamp2["power"] - 3.6) < 1e-6, lamp2)
        status, judged = post("/api/evaluate", {
            "claim": {"type": "lit", "component": "L2", "value": True},
            "netlist": SOLO_FIXED,
        })
        check("solo verdict consistent",
              judged["verdict"]["status"] == "CONSISTENT", judged["verdict"]["status"])
        check("solo made zero coach calls", len(coach_hits) == 0, len(coach_hits))

        print("SMOKE PASSED")
    finally:
        server.shutdown()
        thread.join(timeout=10)


if __name__ == "__main__":
    try:
        main()
    except SmokeFailure as err:
        print("SMOKE FAILED:", err)
        raise SystemExit(1)
