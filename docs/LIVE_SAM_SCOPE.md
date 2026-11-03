# Live SAM 3.1 Scope

Goal: earn the right to say Reality Lens uses Segment Anything Model 3.1
(SAM 3.1) on real uploads - behind a measured accuracy gate, with an honest
fallback. Until the gate passes, every claim stays exactly as it is today:
SAM 3.1 sample-only.

## Where SAM 3.1 stands today

- `src/verityn/sam.py`: isolated SAM 3.1 client, stdlib-only, runs only with
  `VERITYN_SAM_ENABLED=1`. Nothing in the learning journey imports it.
- `scripts/sam_spike.py`: the ONLY live caller. One request per
  (image, prompt) over `tests/fixtures/sam_spike/` (10 images: hand,
  textbook, digital), recording found/not-found per component.
- `docs/sam-spike-results.json`: last run verdict **FAIL - 2 of 10**
  battery-and-bulb against a 7-of-10 threshold.
- Frontend: sample diagrams carry `sam-sample` provenance only when their
  source image came from the spike set; tap-to-segment selects stored
  regions, never runs inference.

So the gate is red today. Live work starts with detection quality, not
with wiring.

## What "live" means (three integration points, in order)

1. **Tap-to-segment on uploads.** The user taps their own photo; SAM 3.1
   returns the region; the lens maps it onto the proposal. No
   auto-decisions: taps only.
2. **Region proposals for review.** Before Spark proposes, SAM 3.1 suggests
   part boxes that the review UI shows as candidates. Spark still writes
   the proposal; SAM 3.1 boxes are evidence, gated by confidence.
3. **Wire-trace refinement.** SAM 3.1 masks seed the traced-wire overlay for
   uploads. This is last because it is the hardest to verify visually.

Each point ships separately behind its own flag and can be killed
without touching the others.

## The accuracy gate

The gate stays a script, not a feeling. Extend `scripts/sam_spike.py`:

- Keep found/not-found per (image, prompt), and add box-overlap (IoU
  against the hand boxes in `lens_samples.json`) for found records.
- Thresholds to flip any live flag: **≥ 8 of 10 images find both battery
  and bulb, no category below 2 of 3, and median IoU ≥ 0.5 on found
  boxes.** Numbers live in the script, results commit to
  `docs/sam-spike-results.json`.
- Gate runs: on demand with explicit authorization (it spends API
  credits), and its verdict is quoted in the PR/commit that flips a
  flag. Red gate = no flag flip, no exceptions.
- Unit tests keep mocked transport; the gate script is the only live
  caller, as today.

## Architecture when the gate passes

- New flag `VERITYN_SAM_LIVE=1`, separate from the spike flag. The
  propose path (`src/verityn/vision.py`) calls SAM 3.1 only when live is on;
  any failure (timeout, parse, low confidence) falls back to the
  current Spark-only path - never a red error, never a silent fake.
- Timeouts and budgets: keep the 60 s client timeout; cap live calls
  per upload (propose-time boxes + user taps only, no polling).
- Provenance in the UI: review shows `SAM 3.1 assist` with per-box
  confidence when live boxes were used, `Spark only` otherwise. Trace
  keeps the raw boxes; sample `sam-sample` labels stay as they are.
- Privacy: uploads already travel to the vision endpoint for
  proposals; SAM 3.1 sees the same bytes under the same handling - mask
  payloads validated structurally and dropped, as today.

## Rollout steps

1. Iterate prompts/box parsing until the gate passes (no product code).
2. Ship point 1 (upload taps) behind `VERITYN_SAM_LIVE` + per-point flag.
3. Judge the review UX on real photos, then point 2, then point 3.
4. Update README, PITCH, and the Hub disclosures from "sample-only" to
   the exact live behavior with the gate score quoted.

## Non-goals

- No auto-confirm from SAM 3.1 output: the learner always confirms.
- No SAM 3.1 in Guided Lab, scoring, or the solver path.
- No stored user images: live calls are request-scoped like proposals.

## Open questions

- Judges: does "SAM 3.1 assists review behind a measured gate" read as
  real SAM 3.1 usage for the award, or do they expect end-to-end
  segmentation? The tap + candidate design is the honest middle.
- Credit budget for gate runs: who authorizes and how often?
