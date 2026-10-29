# Verityn: Test Plan (as built + roadmap)

Matches `ARCHITECTURE.md` (simulation-grounded, AI-guided).
Principles: deterministic code is tested with exact expectations; model
behaviour is *measured* with mocked HTTP and reported, never assumed;
no test makes live model calls or spends credits. Thresholds below are
starting points, written down before we see results. If we change one,
we record why.

## 1. Deterministic suites (built; run on every change)

Backend (`pytest backend/tests`): solver truth tables and rejection
codes, evaluator verdicts and tolerance boundaries, API contracts
including malformed/404/405/500 JSON safety, lesson-pack proof tests
that run the real solver over pack netlists and the exact
converter-output canvas shapes, coach eligibility/refusal/fallback,
leak-guard adversarial cases, log sanitization (caplog: no keys,
bodies, prompts, or model text), and a naming audit that keeps
prototype output from being labelled Meta AI.

Frontend (`npm test`, vitest, no DOM harness): API client guards and
error classification, canvas-to-netlist conversion, lesson gates and
verdict derivation, Evidence Trace builder, pack consistency (shape,
seed conversion, hint honesty). Component wiring is verified by
inspection plus the browser journey below.

Gates: backend suite, frontend suite, `npm run lint` (0/0),
`npm run build` (`tsc -b` + vite). UI acceptance (DESIGN_SPEC §9):
no raw hex in components, keyboard path, focus visibility,
reduced-motion parity, greyscale-readable verdicts.

## 2. Browser journey (demo verification, no new dependencies)

Production build served alongside the API, driven in headless Chrome
over CDP with plain Node (fetch + WebSocket): predict → build → Reality Check;
contradiction → coach badge → evidence pointer; constrained demonstration
preview/apply/undo; transfer locked until pack values, then Solo predict →
build → verdict with zero `/api/coach/*` requests in the network log; Not-sure and
stale-clearing paths; prediction-gate bypass attempts. No scenario
is reported passed unless actually exercised. Screenshots record the
verdict, trace, and solo states.

## 3. Live model checks (manual, authorized one at a time)

Live Meta calls never run in the suite. Each authorized diagnostic
is a single generation with no retries, against explicit questions
(transport vs parse vs validation), and only sanitized stage codes,
shape metadata, allowlisted finish reasons, and token counts are
captured. Billing impact is dashboard-only and never inferred.

Vision checks use the same one-request/no-retry rule. Record only sanitized
stage, HTTP status category, proposal status, component/connection counts,
polarity-known count, and validation result. A transport failure with no HTTP
status is not evidence of a provider schema failure. The offline fixture remains
the honest fallback for browser rehearsal.

## 4. Roadmap test requirements (locked tiers, deadline Nov 4, 9:00 PM ET)

1. **Reliable demo & framing.** The §2 journey stays green; any new
   UI copy asserting solver-vs-AI responsibility gets a naming-audit
   case; defect fixes land with regression tests first.
2. **Reality Lens.** Proposal schema tests (malformed/unparseable uploads
   rejected); status/polarity/provenance tests; geometry-to-layout tests;
   confirmation-gate tests proving unconfirmed proposals never reach
   simulate/evaluate; solver behaviour on confirmed netlists unchanged.
3. **Physics visuals.** Glow intensity is a pure function of
   solver power (unit-tested, P = I²R); animation active strictly
   when solver current > 0 and frozen on edit (state tests);
   highlight IDs validated against solver evidence (unknown IDs
   dropped); reduced-motion path renders identical facts.
4. **Voice, demonstrations & visual coaching.** Transcripts treated as plain
   Why text through existing guards; permission/unsupported/silence failures
   preserve typed input; demonstration actions validated against the live
   canvas netlist; apply/undo reruns the solver; highlight IDs validated;
   unknown IDs are dropped without guessing.

## 5. What we report (README results)

Suite totals, journey scenario table, and any measured model
behaviour with sample sizes (e.g. template-fallback rate across
hint tests). Every number carries its n. No claim about learning
outcomes — the trace shows one session's observed evidence only.

## 6. Explicitly out of scope

Open-chat evaluation, emotion detection, growth scoring, mastery
badges, second-opinion models, and any benchmark that requires live
calls inside the suite. Slow-path rescue-rate and voice-accuracy
benchmarks from earlier drafts are dropped with the features they
measured; if P2/P4 ship, §4 defines their smaller replacements.

## 7. Rehearsal log

### P0 judge-path rehearsal — 2026-10-29 (uncommitted tree on 2c81fae)

Stack: current-tree Flask backend (:5050) + vite dev (:5174, proxy),
fake coach only (no model key), headless Chrome over CDP.
Gates at rehearsal time: backend 505, frontend 239, lint 0/0, build clean.

- Committed `scripts/smoke_browser.mjs`: PASSED — misconception path,
  mid-ladder demo excursion (apply → Consistent 3.6 W → undo → dark)
  with R1/R2 preserved, R4 served after undo, exactly 3 coach calls
  in R1/R2/R4 order, zero solo coach calls, proof cards, drawer
  sections, lazy lab chunk, 390px hub overflow 0px.
- P0 rehearsal (throwaway `/tmp` driver): PASSED — LabNav lens link
  and Auto-demo toggle visible in-lab; 12 screenshots in `docs/demo/`
  (homepage, prediction, build-verified, contradiction,
  demonstration, solo, finale, lens lab steps, lens sample overlay,
  1180×820 tablet, 390×844 mobile); overflow 0px at 1180 and 390.
- Replay ×2 + consistent path (throwaway driver): PASSED — replay
  returns to a clean hub, prediction restarts unanswered
  (Continue disabled), consistent reality verdict skips the coach.
- Live `scripts/smoke_live.py`: SMOKE PASSED (ephemeral port).

Findings fixed in this round:

- Coach ladder reset to R1 when a demonstration flipped the verdict:
  the verdict subtree remounts on every re-run. Served rungs and
  reflection drafts now live in canvas-owned memory; the ladder keeps
  a stable mount across idle/checking/done. The committed smoke runs
  the demo excursion mid-ladder as the regression guard.
- The long-running judging backend on :5000 was stale (R1 responses
  lacked the `actions` key the current frontend requires; the UI
  honestly showed `Coach unavailable`). Restart it from the current
  tree before judging; nothing was changed to accommodate it.

Not covered here: live vision upload (no key in this environment;
lens verified via curated samples + the stubbed-proposal browser
run), full keyboard/contrast audit, demo recording.
