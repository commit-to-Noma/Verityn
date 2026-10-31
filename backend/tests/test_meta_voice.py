import io
import urllib.request

import pytest

from app import create_app
from verityn import meta_voice


def _wav():
    return b"RIFF" + b"\x00" * 4 + b"WAVE" + b"audio"


class VoiceStub:
    def __init__(self, transcript="The switch is open."):
        self.transcript = transcript
        self.audio = None

    def transcribe(self, audio):
        self.audio = audio
        return self.transcript


def test_transcribe_requires_configured_provider():
    response = create_app().test_client().post(
        "/api/voice/transcribe",
        data={"audio": (io.BytesIO(_wav()), "recording.wav", "audio/wav")},
    )
    assert response.status_code == 503
    assert response.get_json()["error_code"] == "VOICE_UNAVAILABLE"


def test_transcribe_validates_upload_and_returns_transcript():
    provider = VoiceStub()
    client = create_app(voice_provider=provider).test_client()

    malformed = client.post(
        "/api/voice/transcribe",
        data={"audio": (io.BytesIO(b"not wav"), "recording.wav", "audio/wav")},
    )
    assert malformed.status_code == 400

    response = client.post(
        "/api/voice/transcribe",
        data={"audio": (io.BytesIO(_wav()), "recording.wav", "audio/wav")},
    )
    assert response.status_code == 200
    assert response.get_json() == {"transcript": "The switch is open."}
    assert provider.audio == _wav()


def test_meta_transcriber_sends_documented_multipart_request(monkeypatch):
    captured = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return b'{"transcript":"  The circuit is open.  "}'

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    transcriber = meta_voice.MetaVoiceTranscriber("test-key")

    assert transcriber.transcribe(_wav()) == "The circuit is open."
    request = captured["request"]
    assert request.full_url == "https://api.meta.ai/v1/asr/transcribe"
    assert request.get_header("Authorization") == "Bearer test-key"
    assert "multipart/form-data; boundary=" in request.get_header("Content-type")
    body = request.data
    assert b'"model": "muse-voice-transcribe-1.0"' in body
    assert b'"audioEncoding": "WAV"' in body
    assert _wav() in body
    assert captured["timeout"] == meta_voice.META_VOICE_TIMEOUT_S
