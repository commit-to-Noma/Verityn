"""Meta Muse Voice Transcribe provider.

Request contract verified against Meta's official cookbook recipe
(``06_muse_voice/01_voice_api_fundamentals``): Bearer auth, multipart
``request`` JSON part (``model``, ``audioEncoding: WAV``,
``mode: PUSH_TO_TALK``) plus the ``audio`` file part, reading
``transcript`` from the JSON response. The engine is native at 24 kHz,
matching the browser encoder.
"""

import json
import urllib.error
import urllib.request
import uuid


META_VOICE_URL = "https://api.meta.ai/v1/asr/transcribe"
META_VOICE_MODEL = "muse-voice-transcribe-1.0"
META_VOICE_TIMEOUT_S = 30


class VoiceTranscriptionError(Exception):
    """A safe, user-facing transcription failure."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


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
            if error.code == 401:
                raise VoiceTranscriptionError(
                    "The server's Meta credential was not accepted.",
                    status=error.code,
                ) from error
            raise VoiceTranscriptionError(
                "Muse Voice Transcribe could not process this recording.",
                status=error.code,
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


def wav_seconds(audio):
    """Return the duration of a PCM WAV recording, or 0.0 when unknown.

    Reads the fmt parameters and walks chunks to the data payload, so
    converted files with filler chunks (afconvert emits FLLR) report
    honestly; never guesses from the byte count alone.
    """
    if len(audio) < 44:
        return 0.0
    channels = int.from_bytes(audio[22:24], "little")
    sample_rate = int.from_bytes(audio[24:28], "little")
    bits = int.from_bytes(audio[34:36], "little")
    data_start, data_bytes = 0, 0
    offset = 12
    while offset + 8 <= len(audio):
        chunk = audio[offset:offset + 4]
        size = int.from_bytes(audio[offset + 4:offset + 8], "little")
        if chunk == b"data":
            data_start, data_bytes = offset + 8, size
            break
        offset += 8 + size + (size % 2)
    if channels <= 0 or sample_rate <= 0 or bits <= 0 or data_bytes <= 0:
        return 0.0
    bytes_per_second = sample_rate * channels * bits / 8
    if bytes_per_second <= 0:
        return 0.0
    return round(min(data_bytes, len(audio) - data_start) / bytes_per_second, 2)
