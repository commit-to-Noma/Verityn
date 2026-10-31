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
    body = response.get_json()
    assert body["transcript"] == "The switch is open."
    assert body["trace"]["output"] == "transcript"
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


def _real_wav(data_bytes=4800):
    header = (
        b"RIFF" + (36 + data_bytes).to_bytes(4, "little") + b"WAVE" +
        b"fmt " + (16).to_bytes(4, "little") +
        (1).to_bytes(2, "little") + (1).to_bytes(2, "little") +
        (24000).to_bytes(4, "little") + (48000).to_bytes(4, "little") +
        (2).to_bytes(2, "little") + (16).to_bytes(2, "little") +
        b"data" + data_bytes.to_bytes(4, "little")
    )
    return header + b"\x00" * data_bytes


def test_transcribe_reports_source_and_seconds():
    client = create_app(voice_provider=VoiceStub()).test_client()
    response = client.post(
        "/api/voice/transcribe",
        data={"audio": (io.BytesIO(_real_wav(4800)),
                        "recording.wav", "audio/wav")},
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["transcript"] == "The switch is open."
    assert body["source"] == "meta-voice-transcribe"
    assert body["seconds"] == 0.1


def test_wav_seconds_reads_header_or_admits_unknown():
    assert meta_voice.wav_seconds(_real_wav(48000)) == 1.0
    assert meta_voice.wav_seconds(b"RIFF" + b"\x00" * 40) == 0.0
    assert meta_voice.wav_seconds(b"short") == 0.0


def test_transcribe_rejects_recordings_over_two_megabytes():
    from app import MAX_VOICE_BYTES

    assert MAX_VOICE_BYTES == 2 * 1024 * 1024
    client = create_app(voice_provider=VoiceStub()).test_client()
    big = _real_wav(4800) + b"\x00" * (MAX_VOICE_BYTES + 1)
    response = client.post(
        "/api/voice/transcribe",
        data={"audio": (io.BytesIO(big), "recording.wav", "audio/wav")},
    )
    assert response.status_code == 413
    assert response.get_json()["error_code"] == "VOICE_TOO_LARGE"


def _http_error(code):
    return urllib.error.HTTPError(
        "https://api.meta.ai/v1/asr/transcribe", code, "error", {}, None)


def test_transcriber_maps_http_status_to_safe_errors(monkeypatch):
    def fake_urlopen(request, timeout, code=[400]):
        raise _http_error(code[0])

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    transcriber = meta_voice.MetaVoiceTranscriber("test-key")

    with pytest.raises(meta_voice.VoiceTranscriptionError) as generic:
        transcriber.transcribe(_wav())
    assert generic.value.status == 400
    assert generic.value.args[0] == (
        "Muse Voice Transcribe could not process this recording.")

    def fake_unauthorized(request, timeout):
        raise _http_error(401)

    monkeypatch.setattr(urllib.request, "urlopen", fake_unauthorized)
    with pytest.raises(meta_voice.VoiceTranscriptionError) as denied:
        transcriber.transcribe(_wav())
    assert denied.value.status == 401
    assert "credential" in denied.value.args[0]


def test_transcribe_failure_logs_status_without_secrets(caplog):
    class FailingVoice:
        def transcribe(self, audio):
            raise meta_voice.VoiceTranscriptionError(
                "Muse Voice Transcribe is temporarily unavailable.")

    client = create_app(voice_provider=FailingVoice()).test_client()
    with caplog.at_level("WARNING", logger="app"):
        response = client.post(
            "/api/voice/transcribe",
            data={"audio": (io.BytesIO(_real_wav(4800)),
                            "recording.wav", "audio/wav")},
        )
    assert response.status_code == 502
    assert "voice transcribe failed: http_status=None" in caplog.text
    assert "test-key" not in caplog.text
