"""Source-wide provider-naming audit (M8).

Shipped runtime code and UI strings must never claim Meta AI use.
Planning docs (docs/), the README, and tests may discuss future
integration, so they are outside this audit by design.
"""

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCANNED = [
    ROOT / "frontend" / "src",
    ROOT / "backend" / "app.py",
    ROOT / "src" / "verityn",
]
MODEL_CLAIM = re.compile(r"meta\s+ai", re.IGNORECASE)
TEXT_SUFFIXES = frozenset({".ts", ".tsx", ".py", ".json", ".css", ".html"})


def iter_files():
    for root in SCANNED:
        if root.is_file():
            yield root
        else:
            yield from sorted(path for path in root.rglob("*")
                              if path.is_file()
                              and path.suffix in TEXT_SUFFIXES)


def test_no_model_claims_in_shipped_code():
    hits = [str(path.relative_to(ROOT)) for path in iter_files()
            if MODEL_CLAIM.search(path.read_text())]
    assert hits == []


def test_prototype_badge_is_pinned():
    client = (ROOT / "frontend" / "src" / "api" / "client.ts").read_text()
    assert "Prototype coach" in client
