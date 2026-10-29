# Vision Extraction Breadth Assessment (offline, 2026-10-28)

Independent review of the 10 SAM-spike fixtures against the production
proposal contract (battery/bulb/switch only; strict schema; validator
enforces ready ⟺ certain + fully determined). No live calls were made
for this assessment; live verdicts below come from previously authorized
single-call probes. SAM detection results from `docs/sam-spike-results.json`.

## Verified live (fixtures preserved)

| Fixture | Live status | Notes |
|---|---|---|
| 05_textbook_simple | `ready`, validated | 1 battery + 1 bulb loop; e2e to solver verified (0.6 A / 3.6 W) |
| 06_textbook_switch | `needs_review`, validated | Open switch correct; null polarity honestly held review status |

## Unprobed: supportable in principle, review expected

| Fixture | Independent observation | Expected honest status |
|---|---|---|
| 01_hand_simple | Loop with visible terminal gaps; plate polarity unclear | `needs_review` (uncertain endpoints) |
| 02_hand_open_switch | Open switch clear; same terminal gaps | `needs_review` (gaps + polarity) |
| 03_hand_two_bulbs | Two bulbs in series; bottom circles ambiguous (open switch vs junction dots) | `needs_review` (ambiguous parts) |
| 04_hand_crude_pictorial | Pictorial +/− labels (polarity explicit); large wire gaps | `needs_review` (endpoints), polarity determined |
| 09_digital_phet | Battery + bulb + switch loop, but electron dots, rays, 3D clutter | `needs_review` (noisy contacts) |

## Unprobed: should refuse as unsupported

| Fixture | Independent observation | Expected honest status |
|---|---|---|
| 07_textbook_parallel | 24 V series-parallel **resistor** network; no bulb/switch loop | `unsupported` (outside component vocabulary) |
| 10_digital_schematic_cad | AC sine source + resistors + capacitor + probes; UI chrome | `unsupported` (outside vocabulary + domain) |

## Unprobed: strongest next positive case

08_digital_verityn (clean digital loop; expected B1+S1+L1 structure and
solver values already pinned in `lens_samples.json` as `workbench-switch`).

## Recommended live-call order (if authorized)

1. 08 — expect `ready` or `needs_review`; confirms clean-digital breadth.
2. 02 — expect `needs_review`; confirms honest uncertainty on hand-drawn gaps.
3. 07 or 10 — expect `unsupported`; confirms refusal outside the vocabulary.

Each result must be validated by production `validate_proposal`, preserved
as a labeled fixture on success, and never sent to the solver unconfirmed.
Blanket-running all fixtures is not recommended: 01/03/04/09 add little
information beyond 02 until the three cases above behave.
