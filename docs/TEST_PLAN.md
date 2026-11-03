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
seed conversion, hint honesty), trace store (record/cap/counts) and
trace guards. Component wiring is verified by
inspection plus the browser journey below.

M2 trace: backend `test_trace.py` proves every AI route attaches a
shaped event (or none on refusal), failover credits the validator only
on validation-stage failures, and failure responses carry
`rejected:<code>`; the browser smoke opens the drawer and asserts a
real served event names its tool and guard.

M1 voice remainder: request contract verified against Meta's official
cookbook recipe (endpoint, Bearer auth, `request`+`audio` multipart
parts, `transcript` response); failures map HTTP status to safe errors
(401 names the credential) with sanitized status-only logging. Voice
responses carry `source`/`seconds`; uploads cap at 2 MB derived from
the actual 24 kHz encoder rate. Browser playback defaults off, carries
the not-Meta disclaimer, and never speaks in the demo; smoke toggles
it on and off to prove both states.

M4 triptych: `triptych` unit tests gate the panels on confirm-plus-test
and separate numbers from rejections; the browser smoke stubs vision at
the network layer (zero live calls) and asserts the valid triptych, the
invalid validator-code panel, and no proof before confirm.

M5 evidence card: `card` unit tests prove the model assembles only
session-produced fields (prediction, readings, rung, Solo, trace
counts), omits Solo when not taken, and pairs readings with a verdict
word only when assessable; the browser smoke asserts the card renders
on the finale and the Download click resolves a real PNG render.

M3 sketch pad (flagged, Gate A pending): `strokes` unit tests cover the
undo reducer, pen-only filtering, and 1024-wide export geometry. The pad
is reachable only with `?sketch=1`, exports a white-filled PNG through
the existing `proposeCircuit` image field, and makes no vision call
before Interpret. Gate A (10 iPad sketches, 7/10 usable-or-honest,
zero confident-wrong) decides ship or cut by Mon 12:00.

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
4. **Voice, demonstrations & visual coaching.** Speech-finish events start
   the microphone only in coached lab stages; silence ends a bounded turn;
   transcription and conversational replies surface permission/service
   failures; mute stops speech and listening; Solo and demo do not auto-listen.
   Clear spoken prediction choices advance without requiring a second tap,
   while ambiguous replies remain conversational and typed predictions stay
   manual. Evidence traces start collapsed; Solo wiring is visually separated.
   Demonstration actions are validated
   against the live canvas netlist; apply/undo reruns the solver; highlight IDs
   are validated; unknown IDs are dropped without guessing.

## 5. What we report (README results)

Suite totals, journey scenario table, and any measured model
behaviour with sample sizes (e.g. template-fallback rate across
hint tests). Every number carries its n. No claim about learning
outcomes  -  the trace shows one session's observed evidence only.

## 6. Explicitly out of scope

Open-chat evaluation, emotion detection, growth scoring, mastery
badges, second-opinion models, and any benchmark that requires live
calls inside the suite. Slow-path rescue-rate and voice-accuracy
benchmarks from earlier drafts are dropped with the features they
measured; if P2/P4 ship, §4 defines their smaller replacements.

## 7. Rehearsal log

### P0 judge-path rehearsal  -  2026-10-29 (committed as 1da1665)

Stack: current-tree Flask backend (:5050) + vite dev (:5174, proxy),
fake coach only (no model key), headless Chrome over CDP.
Gates at rehearsal time: backend 505, frontend 239, lint 0/0, build clean.

- Committed `scripts/smoke_browser.mjs`: PASSED  -  misconception path,
  mid-ladder demo excursion (apply → Consistent 3.6 W → undo → dark)
  with Question/Pointer preserved, Demonstration served after undo, exactly 3 coach calls
  in Question/Pointer/Demonstration order, zero solo coach calls, proof cards, drawer
  sections, lazy lab chunk, 390px hub overflow 0px.
- P0 rehearsal (throwaway `/tmp` driver): PASSED  -  LabNav lens link
  and Auto-demo toggle visible in-lab; 12 screenshots in `docs/demo/`
  (homepage, prediction, build-verified, contradiction,
  demonstration, solo, finale, lens lab steps, lens sample overlay,
  1180×820 tablet, 390×844 mobile); overflow 0px at 1180 and 390.
- Replay ×2 + consistent path (throwaway driver): PASSED  -  replay
  returns to a clean hub, prediction restarts unanswered
  (Continue disabled), consistent reality verdict skips the coach.
- Live `scripts/smoke_live.py`: SMOKE PASSED (ephemeral port).

Findings fixed in this round:

- Coach ladder reset to Question when a demonstration flipped the verdict:
  the verdict subtree remounts on every re-run. Served rungs and
  reflection drafts now live in canvas-owned memory; the ladder keeps
  a stable mount across idle/checking/done. The committed smoke runs
  the demo excursion mid-ladder as the regression guard.
- The long-running judging backend on :5000 was stale (R1 responses
  lacked the `actions` key the current frontend requires; the UI
  honestly showed `Coach unavailable`). Restart it from the current
  tree before judging; nothing was changed to accommodate it.

Not covered here at P0 time: live vision upload (no key in this
environment; lens verified via curated samples + the stubbed-proposal
browser run), full keyboard/contrast audit, demo recording.

### P1 live-vision upload  -  2026-10-29 (same tree)

One authorized `POST /api/vision/propose` with
`tests/fixtures/sam_spike/05_textbook_simple..png` against the
key-wired `:5001` backend. No retries.
Result: HTTP 200, provider `meta-spark`, proposal `ready`: battery +
bulb, polarity determined, 2 certain connections forming the loop,
1 documented assumption (6 V). Matches the expected 05 structure.
Two earlier attempts in this session returned `Vision unavailable`
(key not wired into the backend process); both failed before any
inference, so exactly one live vision request was spent here.

### P1 accessibility audit  -  2026-10-29 (same tree, throwaway `/tmp` driver)

15/15 passed in headless Chrome against the current frontend:

- Contrast (token pairs over `#0a0e1c`): body 16.44:1, muted
  8.59:1, flow accents 10.95:1, on-accent button labels 10.95:1,
  ok 10.00:1, bad 7.14:1  -  all above WCAG AA.
- Keyboard-only path hub → predict → answer (Space) → Why input →
  Continue (Enter) → build works; every stop matches
  `:focus-visible` with the 2px outline.
- All visible build-stage buttons ≥ 44px; terminal handles ≥ 24px
  (n=12, min=24, per the documented handle decision).
- Emulated `prefers-reduced-motion` collapses the stage-enter
  animation (1e-05s) and the app's global reduced-motion CSS
  disables animated wire movement.

Known limitation: dragging wires between terminals is
pointer-only; palette buttons are keyboard-reachable but placement
and wiring need a pointer. No keyboard trap was observed on the
audited path.

### Phase 1 shell verification  -  2026-10-29 (uncommitted on 6632ad9)

Backend 505, frontend 245 (9 new: shell location/nav, homepage
copy), lint 0/0, build clean, committed browser smoke passed with
no live calls. Homepage, lens page, and build stage inspected at
1440×900, 1180×820, and 390×844 (`docs/demo/16–19`): two-column
hero, one-line desktop nav, wrapped mobile nav, primary above the
fold, 0px overflow everywhere. Keyboard reaches Hub → Guided Lab
→ Lens (disabled Experiment skipped), `aria-current` marks Hub,
all nav targets 44px, focus outline visible. Live example card
shows pack-verified 0.6 A · 3.6 W; tab title, brand icon
(200, 80 KB), and disabled Next badge asserted in smoke.

Review corrections (same session): removed the duplicate LabNav
strip (persistent nav is now the only in-lab nav; auto toggle
lives in the drawer), fixed all 5 oxlint warnings to a true 0/0
(homepage copy moved to `content/homepage.ts`, ladder memory
writes via callback, dropped render-time netlist ref), and framed
the header logo in an explicit badge with `object-contain`.
Re-verified: backend 505, frontend 245, lint 0/0, build clean,
full smoke passed including the mid-ladder excursion, 3 sizes
re-shot (`16–19`).

### P1 final demo-path rehearsal  -  2026-10-29 (same tree)

Committed `scripts/smoke_browser.mjs`: PASSED on a deterministic
no-key stack (current tree, fake coach). Deliberately not run
against the key-wired `:5001` backend: with a key present, the
misconception path's R1 would attempt a live Meta call, spending
credit and making the rehearsal nondeterministic. The judging
environment has no key, so the fallback path rehearsed here is the
exact demo path. No live coach calls were made in P1.

## 8. Laboratory-phase acceptance (PRODUCT_PLAN §9)

Phase 0 baseline (`6632ad9`, verified this session): backend 505,
frontend 239, lint 0/0, production build clean, committed browser
smoke passed with no live calls. Baseline screenshots in
`docs/demo/` are current for the frozen tree.

Phase 1 shell acceptance (all in the real browser unless noted):

- Persistent shell on every view: logo + name, Laboratory/Hub,
  Guided Lab, Experiment, Reality Lens entries, visible current
  location, in-app back/forward, and a clear Return-to-laboratory
  action  -  every major feature reachable without browser Back.
- `document.title` is `Verityn Laboratory`; a site icon is served
  and referenced (no 404 for the favicon request).
- Exported logo assets exist at bounded sizes (nothing near the
  1.7 MB source ships); header mark and homepage lockup render on
  the dark UI without a raw white box.
- 1440px, 1180px, and 390px: no major dead zones, no horizontal
  overflow; mobile stacks; homepage two-column and lab workspace
  use the wider frame.
- Full existing journey still passes (`scripts/smoke_browser.mjs`
  updated only for moved entries, never weakened): predict →
  build → Reality Check → R1/R2/R4 → demo → solo → finale, zero
  solo coach calls, benches hidden, lazy chunk loads.
- Reality Lens page keeps its order (upload before samples),
  confirm gate, and solver-backed proof values from a fresh run.
- Headline `Turn questions into experiments.` present; no
  removed feature; unfinished shell work disabled or bypassable.

Phase 2 lens acceptance (all in the real browser unless noted):

- Upload panel visible on arrival and still mounted after select,
  error, and proposal; selected preview renders above the
  samples; same-file reselection, Remove, replacement, invalid
  type, oversize, and unreadable-file paths behave.
- Extension fallback accepts a valid image when the browser
  reports an empty MIME type (unit-tested); accept string covers
  PNG/JPEG/WebP MIME types and extensions.
- Stubbed-proposal journey (Fetch-layer stub, zero live calls):
  Hub → Reality Lens → upload → Interpret → Compare default →
  original + replica side by side → confirm gate locked → Confirm
  → fresh solver proof (`Confirmed circuit tested`, measured
  values, `Measured by Verityn Solver`) → Try another image →
  unsupported refusal with guidance and no replica → Hub.
- Ready proposal shows data-derived counts and invites review;
  needs_review flags highlighted terminals with dashed-grey
  uncertain wires; unsupported renders no fake model.
- Meta-vision outage offers Try again, verified sample, and
  Guided Lab return; samples stay usable; health badges stay
  separate (`Simulator ready` vs `Meta vision unavailable`).
- 1440px, 1180px, 390px: panels side by side on desktop, stacked
  on mobile, zero horizontal overflow; no `Experimental` or
  `Snap & Build` learner-facing text remains.
- Unified workbench: a diagram filmstrip (upload beside samples
  with active states) stays mounted through review; switching
  diagrams preserves confirm/test state on both sides; the
  review inspector names the selected part or wire with its
  status and evidence (unit: filmstrip slots and active marks;
  browser: filmstrip presence, inspector selection, switch-away
  and switch-back continuity, screenshot `lens-review`).

Phase 3 demo acceptance (all in the real browser unless noted):

- `Watch the guided demo` visibly performs the journey without
  stalling: scripted choice + why commit, repair wires land,
  solver measures 0.6 A / 3.6 W, contradiction shows 0.0 A /
  0.0 W, R1 → R2 → demonstration → undo → R4 all served, Solo
  completes coach-off, finale shows `Demo complete`.
- Unit-tested: script validity (choices, lesson IDs, seed
  terminals, closed action vocabulary, no solo-coach section),
  the pure beat machine (order, forward-only, pause/resume,
  skip-signal, takeover/exit, replay, finish), and scripted
  wires through the real converter.
- Pause freezes every demo timer (predictions, builds, asks,
  apply, undo, gates); resume re-arms from visible state; skip
  hurries exactly one pending beat action, never two.
- Manual prediction input or structural canvas edits exit the
  demo and preserve the learner's work; gate Continue clicks
  complete the beat and the demo continues.
- Solo makes zero `/api/coach/*` requests and shows no coach UI;
  provider badges always reflect the serving backend.
- Replay restarts cleanly; Try-it-yourself resets to manual lab;
  Exit returns to the hub; shell navigation exits the demo.
- 1440px, 1180px, 390px: demo bar wraps cleanly, step stays
  visible, controls stay 44px, zero horizontal overflow.
- Normal learner mode unchanged without the demo: manual
  predictions, no silent advances, `?auto=1` keeps its old beat.

Phase 4 result acceptance (all in the real browser unless noted):

- Lab stages split into experiment (canvas + controls +
  result banner) and insight (prediction recap + readings +
  verdicts + next action) columns at desktop widths; one
  stacked column below `lg`; the lens replica stays stacked;
  no canvas remounts, no duplicated information.
- Every verdict uses learner wording (`Your prediction
  matched / did not match the circuit result`, `You completed
  the loop`); the cause line derives only from solver +
  netlist; no `Contradicted by the model` headline or
  model-as-authority label survives (source-audited and
  unit-tested).
- Solo renders four beats (prediction, change, per-bulb
  measurement, factual suggestion) with no coach and zero
  `/api/coach/*` calls; the seed netlist and terminal IDs are
  unchanged and every node fits a fresh 390 px mount.
- Finale order is evidence cards → factual narrative →
  capstone → story → `How the system works` → four exits;
  the narrative names the open-switch run and claims nothing
  beyond the snapshots.
- Live coach captions credit Meta Muse Spark and simulator
  grounding; live lens proposals credit Meta proposal with
  solver measurement after confirm; fallback and samples keep
  honest labels; no capability is claimed where unused.
- Voice: support-aware ready line, announced Listening state
  with stop control, editable transcripts, replay-via-Listen,
  no autoplay; recognition stripped in-browser falls back to
  a disabled mic, type-only helper, and intact typing.
- Why-field mic on all three prediction screens fills the
  reason and pre-selects a clear spoken choice without
  committing (`transcriptFill` unit tests); smoke asserts the
  mic renders on L1 and Solo and that Solo still makes zero
  coach calls. Finale learning path narrates the saved
  prediction, wiring, readings, and any applied demonstration
  per chapter (`story` unit tests + smoke `learning path
  personal`). Lesson build copy names the manual Test action;
  no learner-facing text claims automatic testing. Coach
  conversation is tap-to-talk (`Reply by voice`, no
  auto-listen, echo transcript rejected) with identical
  repeats skipped in `speakCoach`; smoke asserts the Reply
  control and no auto-listen. Reality Check shows a stuck
  notice naming a closed switch (`closedSwitchNotice` unit
  tests + smoke excursion).
- Chapter gates keep results visible before any transition;
  manual mode never auto-advances; smoke still covers
  result-with-gate, pause/resume, replay, takeover, and both
  solo zero-coach runs.
- 1440px, 1180px, 390px: zero horizontal overflow on hub,
  build, solo seed, result, and finale; seeds all-visible at
  fresh mounts; screenshots `01–06`, `09`, `11`, `17` in
  `docs/demo/` recaptured on this tree after banner settle.

Phase 5 result acceptance (all in the real browser unless noted):

- Shell `Experiment` entry is enabled with no `Next` badge;
  the bench opens without browser Back, marks
  `aria-current`, and returns to hub, lab, and lens cleanly.
- The bench reuses the lesson canvas: battery, bulb, switch,
  wire palette; placement, wiring, toggle, delete, reset;
  no prediction gate, ladder, verdict, or trace renders.
- No auto-run: a loaded preset sits at `Ready to test your
  circuit.` until `Run experiment`; any edit hides
  measurements and shows `Circuit changed  -  run the
  experiment again.` (unit: converter, ids, reset; browser:
  stale after a real toggle).
- All four presets convert through the shared converter and
  match probe-verified solver outcomes (closed 0.6 A /
  3.6 W, open valid dark, series 0.3 A / 0.9 W each,
  short `SHORTED_BATTERY`); `Test` runs through the normal
  path exactly once, including under StrictMode remounts.
- Invalid states reuse the solver-judged hints (empty,
  dangling, floating, shorted, conflicting, malformed);
  valid-dark, valid-lit, and rejected runs stay visually
  distinct; backend outages keep the bench usable.
- `Ask Muse Spark about this result` is disabled before a
  fresh run and after any edit; it posts only the netlist;
  the server solves before explaining and rejects numbers
  outside the facts (unit: fake, mocked meta, fallback
  label, safe 500). No automatic coach calls in Experiment.
- History logs every run (valid and rejected) with one-line
  summaries and current-vs-previous comparison; survives
  bench reset; never touches lesson snapshots.
- Guided Lab, demo (pause/resume/replay/takeover), Reality
  Lens, Solo zero-coach, and finale all still pass the same
  smoke; experiment coverage adds preset, stale, history,
  explain, reset, and return-leg checks.
- 1440px, 1180px, 390px: zero horizontal overflow; presets,
  canvas, history, and ask stack cleanly; presets fit fresh
  390px mounts; controls stay 44px with visible focus;
  screenshot `20-experiment.png` captured on this tree.

Phase 6 result acceptance (all in the real browser unless noted):

- Default bulbs still measure 0.6 A / 3.6 W intact; rated
  metadata is optional and additive (unit: solver defaults,
  overvoltage, overpower, boundary-intact, exploded-open,
  determinism, input-rule rejections).
- Overwork is a valid measurement with `conditions`/`ratings`,
  never a rejection; no new error codes. Shorts, conflicts,
  dangling, and open switches behave exactly as before.
- The overwork preset converts through the shared converter
  and matches probe-verified solver outcomes on the voltage
  table (6 V intact → 12 V intact → 18 V overworked →
  past-18 V exploded 0.0 A); battery-stack and voltage-edit
  paths agree.
- The explosion latch fires on the exploded run itself, survives no
  longer than the bench (preset load and reset clear it),
  and never wipes the overwork result that caused it; moving
  parts never clears damage.
- Voltage controls accept finite positive volts only, show
  inline errors otherwise, and applying invalidates the stale
  result (unit: validation, latch; browser: stale, label).
- The latest-result card shows per-bulb V/A/W, the safe
  limit, and the previous-run delta from real history; the
  comparison reports battery and power changes computed from
  the two runs, never invented ratios.
- The Stress Test Rig steps one battery through a validated
  ladder (at most 25 points, 0.1–24 V); every point is a real
  bench run labeled `Rig <id> <V> V`, the table reads state
  from history, and the summary names first glow, overwork,
  and the blow point (unit: ladder, states, summary; browser:
  2–8 V sweep, threshold table, screenshot `rig-after-sweep`).
- Eight session missions complete only from recorded runs and
  their netlists (first light, threshold pair, open-switch gap,
  closed lit loop, opposing-battery tug of war, redline plus
  recovery, demolition, finished sweep); each card shows Done
  or its next-step hint (unit: all predicates; browser: seven
  completions, screenshot `bay-missions`).
- Transport failures toast (retry once, then a Retry toast) and
  never block the bench; solver rejections keep plain-words
  names everywhere (codes stay in Trace) with part-naming
  guidance in diagnostics and explanations, color-coded history
  pills, and per-run detail on click; the canvas is recessed
  and rejected wires glow red (unit: codes, guidance, summary;
  browser: friendly short, diagnostics, explain round trip,
  pills, run detail, screenshot `bay-history`).
- A running sweep locks the bench (overlay, disabled controls),
  paces points 400 ms apart, stops on the first rejection with
  a fix-it note, and always releases on terminal failure — a
  dead backend yields a stop note, never a zombie lock — with
  a 30 s run watchdog (browser: lock, cancel, short refusal;
  probes: rage-click, dead-backend sweep).
- Missions live in a slide-out Mission Log drawer (closed by
  default, Escape closes); sweeps run cinema-paced (short
  sweeps take at least 5 s) under an analog gauge with
  amber/red zones, and finished sweeps offer a replay slider
  whose re-runs are real logged runs; voltage edits never
  clear the explosion latch; a dead backend shows an honest
  local ask notice instead of a fake explanation (browser:
  drawer, gauge, replay scrub and re-run; probe: dead-backend
  ask notice).
- Explanations unlock for fresh runs only; the server adds
  limits, battery count/total, conditions, and volts to the
  grounded facts (unit: spy payload, fake overwork/exploded
  text, mocked limit citation, invented-number rejection).
- Guided Lab, demo, Reality Lens, Solo zero-coach, and
  finale still pass the same smoke; overwork coverage adds
  intact, voltage-stale, overwork, explosion, explain, reset,
  and return-leg checks.
- 1440px, 1180px, 390px: zero horizontal overflow; badges,
  card, battery rows, and history stack cleanly; controls
  stay 44px with visible focus; reduced-motion keeps the
  same facts; screenshots `21–23` captured on this tree in
  `docs/demo/`.

Phase 7A result acceptance (all in the real browser unless noted):

- The original homepage opened on `Turn questions into experiments.`
  with Guided Lab, Laboratory scroll, demo, and the live Engineering
  Lab 01 card; see Phase 7B below for the updated STEM framing.
- The turntable shows five stations in order with neighbor
  previews, prev/next controls, direct-select tabs, one
  route action, and truthful static details (unit: order,
  wraparound, selection, route mapping, no-future-claims).
- Every station action works: lab, experiment, lens open
  their routes; coach scrolls to the technology strip;
  solver opens the bench. No dead ends, no fake pages.
- Keyboard: arrows/Home/End move between tabs with
  `aria-selected` and a live-region announcement; Enter and
  Space activate; focus never traps (unit: pure selection;
  browser: real key events).
- No auto-rotation: the station is unchanged after 2.5 s
  without input; no timers exist in the component.
- Reduced motion: the global rule collapses rotation
  animation; content and route actions stay identical.
- Mobile 390px: single station, compact prev/next, wrapping
  tabs, zero horizontal overflow.
- Guided Lab, demo, Reality Lens, Solo zero-coach, finale,
  and Experiment/overwork still pass the same smoke.
- Screenshots `24–25` recaptured, `27–28` added in
  `docs/demo/` on this tree.
