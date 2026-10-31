"""Meta Muse Voice Transcribe provider."""

import json
import urllib.error
import urllib.request
import uuid


META_VOICE_URL = "https://api.meta.ai/v1/asr/transcribe"
META_VOICE_MODEL = "muse-voice-transcribe-1.0"
META_VOICE_TIMEOUT_S = 30


class VoiceTranscriptionError(Exception):
    """A safe, user-facing transcription failure."""


class MetaVoiceTranscriber:
    """Transcribe a WAV recording through Meta Model API."""

    def __init__(self, api_key, model=META_VOICE_MODEL, timeout_s=META_VOICE_TIMEOUT_S):
        if not api_key:
            raise ValueError("Meta API key missing.")
        self.api_key = api_key
        self.model = model
        self.timeout_s = timeout_s

    def transcribe(self, audio):
        boundary = f"verityn-{uuid.uuid4().hex}"
        request_body = json.dumps({
            "model": self.model,
            "audioEncoding": "WAV",
            "mode": "PUSH_TO_TALK",
        }).encode("utf-8")
        parts = [
            (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="request"\r\n'
                "Content-Type: application/json\r\n\r\n"
            ).encode("utf-8"),
            request_body,
            b"\r\n",
            (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="audio"; filename="recording.wav"\r\n'
                "Content-Type: audio/wav\r\n\r\n"
            ).encode("utf-8"),
            audio,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
        body = b"".join(parts)
        request = urllib.request.Request(
            META_VOICE_URL,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Accept": "application/json",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s) as response:
                payload = json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise VoiceTranscriptionError(
                "Muse Voice Transcribe could not process this recording."
            ) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise VoiceTranscriptionError(
                "Muse Voice Transcribe is temporarily unavailable."
            ) from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise VoiceTranscriptionError(
                "Muse Voice Transcribe returned an unreadable response."
            ) from error

        transcript = payload.get("transcript") if isinstance(payload, dict) else None
        if not isinstance(transcript, str):
            raise VoiceTranscriptionError(
                "Muse Voice Transcribe returned an unreadable response."
            )
        return transcript.strip()
