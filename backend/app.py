"""Verityn backend.

Milestone 1: scaffold with a health endpoint only. Solver, ladder, and
AI routes arrive in later milestones.
"""

from flask import Flask, jsonify


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
