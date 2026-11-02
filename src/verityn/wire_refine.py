"""Deterministic wire-trace refinement for vision proposals.

Muse Spark returns roughly-right wire polylines: the right wire, but
floating near the stroke instead of on it. This module snaps each
proposed path onto the actual stroke pixels in the uploaded image, so
the review overlay hugs the drawn wire.

The approach is polarity-blind (dark-on-light sketches, light-on-dark
screenshots, and copper-on-blue diagrams all work): the wire's
appearance is sampled from under the proposed path itself, then each
point is pulled to the most wire-like pixel nearby while staying
anchored to the model's proposal. Anything unexpected fails soft --
the original path is kept, never garbage.
"""

from __future__ import annotations

import io
import statistics

MAX_DIM = 420
MIN_CONTRAST = 0.07
MAX_POINTS = 32
DENSIFY_STEP = 0.035
RIDGE_RADIUS = 0.05
FINE_RADIUS = 0.015
END_FINE_RADIUS = 0.01
MAX_MOVE = 0.12
PASSES = 2


def _load_luma(image_bytes):
    """Return (flat luma grid 0..1, width, height) or None."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return None
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert("L")
            img.thumbnail((MAX_DIM, MAX_DIM))
            width, height = img.size
            if width < 8 or height < 8:
                return None
            data = [px / 255.0 for px in img.getdata()]
    except Exception:
        return None
    return data, width, height


def _sample(data, width, height, x, y):
    """Bilinear luma sample at pixel coords, clamped to the grid."""
    x = min(max(x, 0.0), width - 1.001)
    y = min(max(y, 0.0), height - 1.001)
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    x1 = min(x0 + 1, width - 1)
    y1 = min(y0 + 1, height - 1)
    top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx
    bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx
    return top * (1 - fy) + bottom * fy


def _densify(points, max_points=MAX_POINTS):
    """Subdivide long spans so curves can flex, keeping endpoints."""
    if len(points) >= max_points:
        return [tuple(p) for p in points[:max_points]]
    total = 0.0
    spans = []
    for a, b in zip(points, points[1:]):
        length = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        spans.append(length)
        total += length
    if total <= 0:
        return [tuple(points[0])]
    count = min(max_points, max(len(points), int(total / DENSIFY_STEP) + 1))
    out = []
    for i, (a, b) in enumerate(zip(points, points[1:])):
        share = spans[i] / total
        steps = max(1, round(share * (count - 1)))
        for step in range(steps):
            t = step / steps
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    out.append(tuple(points[-1]))
    return out


def _disc_offsets(radius_px):
    """Integer (dx, dy) offsets inside a disc, nearest-first."""
    r = max(1, int(round(radius_px)))
    offsets = [(dx, dy) for dy in range(-r, r + 1)
               for dx in range(-r, r + 1) if dx * dx + dy * dy <= r * r]
    offsets.sort(key=lambda o: o[0] * o[0] + o[1] * o[1])
    return offsets


def _mean_cost(data, width, height, points_px, wire_luma):
    costs = [_sample(data, width, height, x, y) for x, y in points_px]
    return sum(abs(c - wire_luma) for c in costs) / len(costs)


def _ridge_contrast(data, width, height, x, y, nx, ny):
    """Local stroke strength at a point along a normal direction."""
    lo, hi = 1.0, 0.0
    for step in range(-3, 4):
        luma = _sample(data, width, height, x + nx * step, y + ny * step)
        lo = min(lo, luma)
        hi = max(hi, luma)
    return hi - lo


def _ridge_snap(data, width, height, point, tangent, bg_luma):
    """Slide a point along its normal onto the nearest stroke center.

    Polarity-free: the stroke reads as local contrast whether it is
    dark-on-light, light-on-dark, or colored. Contrast peaks at the
    stroke's edge, so the winning seat is finished with a centroid of
    deviation mass that lands on the centerline. Returns the original
    point when no ridge beats the current seat.
    """
    scale = max(width, height)
    radius = RIDGE_RADIUS * scale
    tx, ty = tangent
    run = (tx * tx + ty * ty) ** 0.5 or 1.0
    nx, ny = -ty / run, tx / run
    px, py = point
    home = _ridge_contrast(data, width, height, px, py, nx, ny)
    best, best_score = (px, py), home
    steps = max(1, int(radius))
    looks = (max(7.0, 0.025 * scale), max(14.0, 0.05 * scale))
    ux, uy = tx / run, ty / run
    for dist in range(1, steps + 1):
        for sign in (1, -1):
            cx, cy = px + nx * dist * sign, py + ny * dist * sign
            contrast = _ridge_contrast(data, width, height, cx, cy, nx, ny)
            if contrast < MIN_CONTRAST:
                continue
            continues = False
            for look in looks:
                for direction in (1, -1):
                    luma = _sample(data, width, height,
                                   cx + ux * look * direction,
                                   cy + uy * look * direction)
                    if abs(luma - bg_luma) >= MIN_CONTRAST:
                        continues = True
                        break
                if continues:
                    break
            if not continues:
                continue
            score = contrast - 0.2 * (dist / max(radius, 1e-6))
            if score > best_score + 1e-9:
                best_score = score
                best = (cx, cy)
    if best == (px, py):
        return best
    mass, weighted = 0.0, 0.0
    for step in range(-5, 6):
        luma = _sample(data, width, height, best[0] + nx * step, best[1] + ny * step)
        weight = (luma - bg_luma) ** 2
        mass += weight
        weighted += weight * step
    if mass <= 1e-9:
        return best
    shift = weighted / mass
    return (best[0] + nx * shift, best[1] + ny * shift)


def _tangents(points_px):
    outs = []
    for i in range(len(points_px)):
        a = points_px[max(i - 1, 0)]
        b = points_px[min(i + 1, len(points_px) - 1)]
        outs.append((b[0] - a[0], b[1] - a[1]))
    return outs


def _despike(coarse, dense_px, tangents):
    """Median-filter the lateral snap profile to kill hijack spikes.

    A wire the path follows gives a smooth lateral-offset profile
    (corners read as sustained steps, which medians preserve); a
    diverted point or two reads as a spike and is pulled back onto
    the run its neighbors found.
    """
    n = len(coarse)
    if n < 3:
        return list(coarse)
    normals = []
    for tx, ty in tangents:
        run = (tx * tx + ty * ty) ** 0.5 or 1.0
        normals.append((-ty / run, tx / run))
    lateral = [(cx - ox) * nx + (cy - oy) * ny
               for (cx, cy), (ox, oy), (nx, ny)
               in zip(coarse, dense_px, normals)]
    out = []
    for i in range(n):
        window = [lateral[max(0, min(n - 1, i + k))] for k in (-2, -1, 0, 1, 2)]
        shift = statistics.median(window)
        (ox, oy), (nx, ny) = dense_px[i], normals[i]
        out.append((ox + nx * shift, oy + ny * shift))
    return out


def _snap_path(data, width, height, points):
    """Pull a normalized polyline onto wire pixels. See module docstring."""
    scale = max(width, height)
    dense = _densify(points)
    dense_px = [(x * (width - 1), y * (height - 1)) for x, y in dense]
    bg_luma = statistics.median(data)
    tangents = _tangents(dense_px)
    coarse = _despike(
        [_ridge_snap(data, width, height, pt, tan, bg_luma)
         for pt, tan in zip(dense_px, tangents)],
        dense_px, tangents)
    wire_luma = statistics.median(
        _sample(data, width, height, x, y) for x, y in coarse)
    if abs(wire_luma - bg_luma) < MIN_CONTRAST:
        return None
    anchors = list(coarse)
    interior_disc = _disc_offsets(FINE_RADIUS * scale)
    end_disc = _disc_offsets(END_FINE_RADIUS * scale)
    current = list(coarse)
    for _ in range(PASSES):
        for i, (px, py) in enumerate(current):
            endpoint = i == 0 or i == len(current) - 1
            disc = end_disc if endpoint else interior_disc
            radius = (END_FINE_RADIUS if endpoint else FINE_RADIUS) * scale
            anchor_w = 1.5 if endpoint else 0.6
            ax, ay = anchors[i]
            if len(current) > 2:
                mx = (current[i - 1][0] + current[(i + 1) % len(current)][0]) / 2
                my = (current[i - 1][1] + current[(i + 1) % len(current)][1]) / 2
            else:
                mx, my = px, py
            best, best_cost = (px, py), None
            for dx, dy in disc:
                cx = min(max(px + dx, 0.0), width - 1)
                cy = min(max(py + dy, 0.0), height - 1)
                wire = abs(_sample(data, width, height, cx, cy) - wire_luma)
                pull = ((cx - ax) ** 2 + (cy - ay) ** 2) ** 0.5 / max(radius, 1e-6)
                kink = ((cx - mx) ** 2 + (cy - my) ** 2) ** 0.5 / max(radius, 1e-6)
                cost = wire + anchor_w * pull * pull + 0.25 * kink * kink
                if best_cost is None or cost < best_cost:
                    best_cost = cost
                    best = (cx, cy)
            current[i] = best
    if _mean_cost(data, width, height, current, wire_luma) >= _mean_cost(
            data, width, height, dense_px, wire_luma):
        return None
    moves = [(((cx - ox) ** 2 + (cy - oy) ** 2) ** 0.5) / scale
             for (cx, cy), (ox, oy) in zip(current, dense_px)]
    if not moves or max(moves) > MAX_MOVE:
        return None
    return [(x / (width - 1), y / (height - 1)) for x, y in current]


def _simplify(points):
    """Drop near-collinear middles; endpoints always survive."""
    if len(points) <= 2:
        return list(points)
    kept = [points[0]]
    for prev, curr, nxt in zip(points, points[1:], points[2:]):
        cross = abs((nxt[0] - prev[0]) * (curr[1] - prev[1])
                    - (nxt[1] - prev[1]) * (curr[0] - prev[0]))
        run = ((nxt[0] - prev[0]) ** 2 + (nxt[1] - prev[1]) ** 2) ** 0.5
        if run > 0 and cross / run > 0.0015:
            kept.append(curr)
    kept.append(points[-1])
    return kept


def refine_path(path, image_bytes):
    """Snap one normalized polyline to image strokes, or return None.

    Returns None when the path should be kept as-is (low contrast, no
    improvement, excessive movement, or any image failure).
    """
    if not path or len(path) < 2:
        return None
    try:
        loaded = _load_luma(image_bytes)
    except Exception:
        return None
    if loaded is None:
        return None
    data, width, height = loaded
    try:
        snapped = _snap_path(data, width, height, [(float(x), float(y)) for x, y in path])
    except Exception:
        return None
    if snapped is None:
        return None
    simple = _simplify(snapped)[:MAX_POINTS]
    if len(simple) < 2:
        return None
    return [[round(x, 4), round(y, 4)] for x, y in simple]


def refine_proposal_paths(proposal, image_bytes):
    """Return a copy of a validated proposal with snapped wire paths.

    Null paths stay null. The input is never mutated. Any failure
    returns an equal-valued copy with the original paths.
    """
    connections = []
    for conn in proposal.get("connections", []):
        evidence = conn.get("evidence", {})
        path = evidence.get("path")
        if path is None:
            connections.append(conn)
            continue
        try:
            snapped = refine_path(path, image_bytes)
        except Exception:
            snapped = None
        if snapped is None:
            connections.append(conn)
            continue
        connections.append({
            **conn,
            "evidence": {**evidence, "path": snapped},
        })
    return {**proposal, "connections": connections}
