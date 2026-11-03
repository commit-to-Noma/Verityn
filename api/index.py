"""Vercel serverless entrypoint: one Python function for every /api/* route.

Same Flask app as local dev (`backend/app.py`), plus the same provider
wiring the `__main__` block does: MODEL_API_KEY from the environment
selects the Meta providers, and without it the app keeps its
deterministic fakes. The VERITYN_COACH_FAIL test switch is
deliberately not honored here; it must never be set live.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "src"))

from app import create_app  # noqa: E402
from verityn import (  # noqa: E402
    fake_coach,
    meta_coach,
    meta_voice,
    vision,
)

key = os.environ.get("MODEL_API_KEY", "")
if key:
    app = create_app(
        meta_coach.MetaSparkProvider(api_key=key),
        fallback=fake_coach.FakeCoachProvider(),
        vision_provider=vision.MetaVisionProvider(api_key=key),
        voice_provider=meta_voice.MetaVoiceTranscriber(api_key=key),
    )
else:
    app = create_app()
