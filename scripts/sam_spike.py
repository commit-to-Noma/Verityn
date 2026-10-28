#!/usr/bin/env python3
"""Standalone SAM 3.1 detection spike (World-As-Lab).

Runs text prompts against a directory of circuit images and records
found/not-found per component. This script is the ONLY live caller of
verityn.sam; the learning journey never imports that module.

Usage:
    VERITYN_SAM_ENABLED=1 MODEL_API_KEY=... .venv/bin/python \\
        scripts/sam_spike.py --images DIR --out docs/sam-spike-results.json

Layout: DIR holds image files (.png/.jpg/.jpeg/.webp), optionally
grouped in hand/, textbook/, digital/ subdirectories for the category
breakdown. One request per (image, prompt); no retries.

Exit codes: 0 threshold passed, 2 threshold missed, 3 setup problem.
Never prints keys, image bytes, prompts beyond their names, or mask
payloads.
"""

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from verityn import sam  # noqa: E402

PROMPTS = ("battery", "light bulb", "switch")
SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
CATEGORIES = ("hand", "textbook", "digital")
THRESHOLD_FOUND = 7
THRESHOLD_TOTAL = 10


def collect_images(root):
    """Sorted image files under root; category from parent dir name."""
    found = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUFFIXES:
            continue
        parent = path.parent.name
        category = parent if parent in CATEGORIES else "uncategorized"
        found.append({"id": path.stem, "file": str(path), "category": category,
                      "path": path})
    return found


def run_prompt(api_key, prompt, data):
    """One live call; returns a JSON-safe cell, never raises."""
    try:
        out = sam.segment_image(api_key=api_key, prompt=prompt,
                                image_bytes=data)
    except sam.SamError as err:
        return {"found": False, "records": 0, "boxes": [],
                "error": {"stage": err.stage,
                          "http_status": err.http_status}}
    boxes = [{"id": record["id"], "box": record["box"],
              "confidence": record["box"]["confidence"]}
             for record in out["records"]]
    return {"found": len(boxes) > 0, "records": len(boxes),
            "boxes": boxes, "warnings": out["warnings"], "error": None}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--images", required=True,
                        help="Directory of spike images")
    parser.add_argument("--out", required=True,
                        help="Where to write the results JSON")
    args = parser.parse_args(argv)

    if not sam.sam_enabled():
        print("spike refused: set VERITYN_SAM_ENABLED=1", file=sys.stderr)
        return 3
    api_key = os.environ.get("MODEL_API_KEY", "")
    if not api_key:
        print("spike refused: MODEL_API_KEY is not set", file=sys.stderr)
        return 3
    root = Path(args.images)
    if not root.is_dir():
        print(f"spike refused: no images directory: {root}", file=sys.stderr)
        return 3
    images = collect_images(root)
    if not images:
        print(f"spike refused: no images under {root}", file=sys.stderr)
        return 3

    results = []
    for image in images:
        data = image["path"].read_bytes()
        cells = {}
        for prompt in PROMPTS:
            print(f"{image['id']} / {prompt} ...", file=sys.stderr,
                  flush=True)
            cells[prompt] = run_prompt(api_key, prompt, data)
        both = bool(cells["battery"]["found"]
                    and cells["light bulb"]["found"])
        results.append({"id": image["id"], "file": image["file"],
                        "category": image["category"],
                        "bytes": len(data), "prompts": cells,
                        "battery_and_bulb": both})

    total = len(results)
    both = sum(1 for row in results if row["battery_and_bulb"])
    by_category = {}
    for row in results:
        bucket = by_category.setdefault(
            row["category"], {"total": 0, "battery_and_bulb": 0})
        bucket["total"] += 1
        bucket["battery_and_bulb"] += row["battery_and_bulb"]
    verdict = "PASS" if total == THRESHOLD_TOTAL and both >= THRESHOLD_FOUND else "FAIL"
    report = {"model": sam.SAM_MODEL, "prompts": list(PROMPTS),
              "images": results,
              "summary": {"total": total, "battery_and_bulb": both,
                          "by_category": by_category,
                          "threshold": f"{THRESHOLD_FOUND} of "
                                       f"{THRESHOLD_TOTAL}",
                          "verdict": verdict}}
    Path(args.out).write_text(json.dumps(report, indent=2) + "\n")
    print(f"{both} of {total} images: battery AND bulb "
          f"(threshold {THRESHOLD_FOUND} of {THRESHOLD_TOTAL}): {verdict}")
    return 0 if verdict == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
