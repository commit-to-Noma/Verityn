"""Wire-trace refinement: snap proposed paths onto image strokes.

Synthetic images with known strokes; no network, no credits.
"""

import io
import math

from PIL import Image, ImageDraw

from verityn import wire_refine


def _stroke_image(size, strokes, bg):
    img = Image.new("RGB", (size, size), bg)
    draw = ImageDraw.Draw(img)
    for color, width, points in strokes:
        scaled = [(x * size, y * size) for x, y in points]
        draw.line(scaled, fill=color, width=width, joint="curve")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _point_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    run = dx * dx + dy * dy
    t = 0.0 if run == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / run))
    return math.hypot(px - (ax + dx * t), py - (ay + dy * t))


def _residual(path, truth):
    """Mean distance from each path point to the true stroke polyline."""
    spans = list(zip(truth, truth[1:]))
    dists = []
    for x, y in path:
        dists.append(min(_point_segment(x, y, ax, ay, bx, by) for (ax, ay), (bx, by) in spans))
    return sum(dists) / len(dists)


SIZE = 300
DIAGONAL = [(0.1, 0.8), (0.9, 0.2)]
OFFSET_DIAGONAL = [[0.1, 0.755], [0.5, 0.455], [0.9, 0.155]]


def test_dark_stroke_on_light_snaps_onto_centerline():
    raw = _stroke_image(SIZE, [((0, 0, 0), 6, DIAGONAL)], (255, 255, 255))
    before = _residual(OFFSET_DIAGONAL, DIAGONAL)
    refined = wire_refine.refine_path(OFFSET_DIAGONAL, raw)
    assert refined is not None
    assert _residual(refined, DIAGONAL) < before / 3


def test_light_stroke_on_dark_snaps_onto_centerline():
    raw = _stroke_image(SIZE, [((255, 255, 255), 6, DIAGONAL)], (10, 10, 20))
    refined = wire_refine.refine_path(OFFSET_DIAGONAL, raw)
    assert refined is not None
    assert _residual(refined, DIAGONAL) < _residual(OFFSET_DIAGONAL, DIAGONAL) / 3


def test_colored_stroke_on_colored_background_snaps():
    raw = _stroke_image(SIZE, [((200, 120, 40), 7, DIAGONAL)], (150, 200, 240))
    refined = wire_refine.refine_path(OFFSET_DIAGONAL, raw)
    assert refined is not None
    assert _residual(refined, DIAGONAL) < _residual(OFFSET_DIAGONAL, DIAGONAL) / 3


def test_curved_stroke_snaps_without_losing_bends():
    arc = [(0.1 + 0.8 * t, 0.5 + 0.12 * math.sin(t * math.pi)) for t in [i / 16 for i in range(17)]]
    raw = _stroke_image(SIZE, [((0, 0, 0), 6, arc)], (255, 255, 255))
    proposed = [[0.1 + 0.8 * t, 0.5 + 0.12 * math.sin(t * math.pi) + 0.05] for t in [0, 0.25, 0.5, 0.75, 1.0]]
    refined = wire_refine.refine_path(proposed, raw)
    assert refined is not None
    assert len(refined) > 2
    assert _residual(refined, arc) < _residual(proposed, arc) / 3


def test_already_accurate_path_barely_moves():
    raw = _stroke_image(SIZE, [((0, 0, 0), 6, DIAGONAL)], (255, 255, 255))
    exact = [[0.1, 0.8], [0.5, 0.5], [0.9, 0.2]]
    refined = wire_refine.refine_path(exact, raw)
    assert refined is not None
    assert _residual(refined, DIAGONAL) < 0.01


def test_nearby_blob_does_not_hijack_the_trace():
    img = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    wire = [(0.1, 0.5), (0.9, 0.5)]
    draw.line([(x * SIZE, y * SIZE) for x, y in wire], fill=(0, 0, 0), width=5)
    draw.rectangle([SIZE * 0.5 - 7, SIZE * 0.472 - 2, SIZE * 0.5 + 7, SIZE * 0.472 + 2], fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    proposed = [[0.1, 0.46], [0.5, 0.46], [0.9, 0.46]]
    refined = wire_refine.refine_path(proposed, buf.getvalue())
    assert refined is not None
    spans = list(zip(wire, wire[1:]))
    worst = max(
        min(_point_segment(x, y, ax, ay, bx, by) for (ax, ay), (bx, by) in spans)
        for x, y in refined
    )
    assert worst < 0.015


def test_low_contrast_keeps_original():
    raw = _stroke_image(SIZE, [((140, 140, 140), 6, DIAGONAL)], (150, 150, 150))
    assert wire_refine.refine_path(OFFSET_DIAGONAL, raw) is None


def test_garbage_bytes_keep_original():
    assert wire_refine.refine_path(OFFSET_DIAGONAL, b"not an image") is None
    assert wire_refine.refine_path(OFFSET_DIAGONAL, b"") is None


def test_short_and_empty_paths_keep_original():
    raw = _stroke_image(SIZE, [((0, 0, 0), 6, DIAGONAL)], (255, 255, 255))
    assert wire_refine.refine_path([], raw) is None
    assert wire_refine.refine_path([[0.5, 0.5]], raw) is None


def _proposal(path):
    conn = {"from": {"node": "b1", "terminal": "a"},
            "to": {"node": "l1", "terminal": "a"},
            "uncertain": False,
            "evidence": {"region_id": "v1", "path": path}}
    return {"status": "needs_review", "components": [], "connections": [conn]}


def test_refine_proposal_snaps_paths_and_preserves_nulls():
    raw = _stroke_image(SIZE, [((0, 0, 0), 6, DIAGONAL)], (255, 255, 255))
    proposal = _proposal([list(p) for p in OFFSET_DIAGONAL])
    out = wire_refine.refine_proposal_paths(proposal, raw)
    assert out is not proposal
    assert _residual(out["connections"][0]["evidence"]["path"], DIAGONAL) < 0.02
    assert proposal["connections"][0]["evidence"]["path"] == OFFSET_DIAGONAL
    nulled = wire_refine.refine_proposal_paths(_proposal(None), raw)
    assert nulled["connections"][0]["evidence"]["path"] is None


def test_refined_paths_stay_compact_and_bounded():
    raw = _stroke_image(SIZE, [((0, 0, 0), 6, DIAGONAL)], (255, 255, 255))
    long_path = [[0.1 + 0.8 * i / 31, 0.755 - 0.6 * i / 31] for i in range(32)]
    refined = wire_refine.refine_path(long_path, raw)
    assert refined is not None
    assert 2 <= len(refined) <= 32
    for x, y in refined:
        assert 0 <= x <= 1 and 0 <= y <= 1
