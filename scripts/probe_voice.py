#!/usr/bin/env python3
"""One-command live voice probe: POST a short WAV to /api/voice/transcribe.

Usage (backend running with the Meta key server-side, key never leaves it):
    python scripts/probe_voice.py [clip.wav] [base-url]

With no file, synthesizes a 2 s test tone (proves the round trip; expect an
empty transcript for a tone). With a file, sends your recording instead.
Prints HTTP status, transcript, seconds, and source. Never prints secrets.
"""

import json
import math
import os
import struct
import sys
import urllib.request
import wave

BASE = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("VERITYN_BASE", "http://127.0.0.1:5000")
RATE = 16000


def tone_wav(path, seconds=2.0):
    frames = b"".join(
        struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / RATE)))
        for i in range(int(RATE * seconds))
    )
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(frames)


def main():
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        path = "/tmp/verityn_probe_tone.wav"
        tone_wav(path)
    with open(path, "rb") as handle:
        audio = handle.read()
    boundary = "probe-voice-boundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="audio"; filename="probe.wav"\r\n'
        "Content-Type: audio/wav\r\n\r\n"
    ).encode() + audio + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        BASE.rstrip("/") + "/api/voice/transcribe",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, payload = response.status, response.read()
    except urllib.error.HTTPError as err:
        status, payload = err.code, err.read()
    print(f"status: {status}")
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        print(f"non-JSON body: {payload[:200]!r}")
        return
    for key in ("transcript", "seconds", "source", "error_code", "error_message"):
        if key in data:
            print(f"{key}: {data[key]}")


if __name__ == "__main__":
    main()
