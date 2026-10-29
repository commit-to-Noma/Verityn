# Verityn: product and submission plan

Status: working source of truth for the final hackathon build.

This document tracks the product story, feature inventory, UI states, model
boundaries, verification gates, and remaining work. A feature is complete only
when its learner path, failure state, deterministic evidence, and regression
coverage are present.

## 1. Product promise

Verityn helps learners practise scientific reasoning by making a claim,
building or interpreting a model, testing it, and explaining what the evidence
shows.

> Meta AI guides the question. The learner makes the meaning. The deterministic
> simulator supplies the evidence.

Circuits are the complete shipped experience. Other sciences are expansion
directions, not capabilities we imply are already built.

## 2. Complete learner journey

| Stage | Learner action | System responsibility | Evidence |
|---|---|---|---|
| Welcome | Choose the circuit lab or Reality Lens | Explain the mission and AI role | Clear primary CTA |
| Predict | Choose or write an expected outcome | Lock and preserve the claim | Prediction snapshot |
| Build | Place components and connect the circuit | Validate topology and invalid states | Confirmed netlist |
| Reality Check | Run the solver and reconsider | Show current, voltage, power, and verdict | Solver-backed comparison |
| Coach | Ask for a bounded hint | Return R1/R2/R4 guidance grounded in evidence | Provider-labelled response |
| Demonstration | Preview a safe experiment | Validate action, rerun solver, animate result | Demonstration trace event |
| Solo | Transfer to a fresh circuit | Disable coaching and keep solver authoritative | Independent verdict |
| Finale | Review the session | Reconstruct saved evidence without claiming mastery | Trace and factual recap |

No stage may silently advance past a new result. Auto-demo may advance only
after the same visible gate is satisfied; normal judging mode gives the learner
time to see the result.

## 3. Feature inventory

### Shipped and required to protect

- [x] Focused homepage with circuit mission, method cards, future subjects, and
  three entry points: lab, Reality Lens, guided demo.
- [x] Predict → Build → Reality Check → Solo stage model and prediction gate.
- [x] Deterministic circuit solver/evaluator owns measurements, verdicts,
  invalid-circuit errors, and expected outcomes.
- [x] Meta Muse provider label, deterministic fallback, and R1/R2/R4 coach
  ladder with refusal when the learner asks out of order.
- [x] Coach failure card with retry; transport failures never retry silently.
- [x] Closed-vocabulary demonstrations with preview, apply, undo, fresh solver
  run, measured visual change, and Evidence Trace entry.
- [x] Optional voice playback and microphone Why input; typed input remains
  reliable and primary.
- [x] Reality Lens two-panel review: original image beside an editable proposed
  circuit, reveal animation, and original/detected/model view modes.
- [x] Component/connection provenance, polarity where known, and explicit
  `ready`, `needs_review`, and `unsupported` states.
- [x] Confirm/discard gate: unconfirmed vision proposals cannot reach canvas or
  solver; verified offline fixture and sample picker support rehearsal.
- [x] Replay reset, Auto-demo badge/behaviour, backend health status, and clean
  Solo path with zero coach calls.
- [x] Finale proof cards and Evidence Trace derived from saved snapshots,
  including incomplete/skipped-chapter fallbacks.
- [x] Backend/frontend tests, lint, production build, and deterministic/browser
  smoke checks.

### Final polish still required

- [x] Complete a fresh live browser rehearsal against the current backend and
  frontend; record the result in [TEST_PLAN.md](./TEST_PLAN.md).
- [x] Run Reality Lens with the authorized network gate when available. If it
  fails at transport, preserve the offline fixture and report that honestly.
- [x] Check 1440×900, 1180×820, and narrow layouts; promote essential tools out
  of drawers that hide the first-run path.
- [x] Verify every primary action has visible loading, empty, error, retry,
  disabled-reason, and success states.
- [x] Verify keyboard navigation, focus, reduced motion, contrast, and 44px
  touch targets in the actual browser.
- [x] Capture prediction, contradiction, Reality Lens, demonstration, Solo, and
  finale screenshots.
- [ ] Freeze copy and record a reliable 60–90 second demo with Auto-demo and
  the verified fixture as backup paths.
- [ ] Re-run all gates after recording; commit the exact submission build.

## 4. UI and modal inventory

### Home and lab shell

The first screen answers what Verityn does, why prediction comes first, and what
Meta AI does. The hero names the transformation (diagram → Meta interpretation
→ editable circuit → solver evidence); primary entry is `Start with a diagram`,
secondary is `Learn through the guided circuit lab`, and `Watch the guided
demo` is a quiet link. A `What does what` strip credits Meta Muse Spark,
Reality Lens, and the Verityn Solver. The lab shell exposes stage, simulator
readiness, backend health, replay, and the next action. Reality Lens is a
first-class page; developer controls stay in their own drawer.

### Prediction and build

The prediction control is dominant and explains that the claim is saved before
coaching becomes available. Editing cancels pending automatic transition. The
canvas is the visual centre: palette, topology guidance, invalid-state text,
measurements, switch state, and simulation action must not be buried.

### Reality Check and coach

The result shows original prediction, simulator observation, measured values,
verdict, and next action in that order. An open-switch contradiction explicitly
connects `0.0 A` to the broken loop and never fabricates measurements for a
rejected circuit. Coach cards carry `Meta Muse` or `Fallback coach`, rung,
grounded question/evidence pointer, and next action. Failure is a labelled
`Coach unavailable` card with retry and a typed path forward.

### Demonstration and Reality Lens

The app previews a model-requested allowed action, names its target, and offers
Apply/Keep exploring or Undo. Model text cannot write arbitrary canvas state.
Reality Lens is explicitly two-panel: source image on the left, proposed
interactive circuit on the right. Original/detection/model view toggles expose
what was seen; uncertain parts are marked for review; Confirm is disabled until
the proposal is reviewable; Discard returns to the prior state.

### Voice, Solo, and finale

Listen is optional playback. Microphone input is editable before submission;
permission denial, unsupported browser, silence, and recognition failure retain
typed input. Solo shows `Coach off` and no coach controls. Finale shows
Prediction, Simulator evidence, Independent transfer, and a factual Evidence
Trace, never mastery or learning-gain claims.

Required modal/gate states: prediction commit, invalid circuit, coach
unavailable/retry, demonstration preview/apply/undo, unsupported or
needs-review vision proposal, vision confirm/discard, voice failure, replay
reset, and Solo coach-off.

## 5. Technical and model boundaries

| Area | Meta model/provider may do | Verityn code must do |
|---|---|---|
| Coach | Ask a bounded Socratic question or point to allowed evidence | Decide eligibility, rung, facts, fallback, and UI state |
| Demonstration | Request an allowed action | Validate against stage/netlist, mutate state, rerun solver |
| Vision | Propose component/connection evidence | Validate schema, topology, provenance, polarity, confirmation, handoff |
| Voice | Transcribe or synthesize text | Keep transcript editable, handle permissions, never require voice |
| Solver | None | Compute current, voltage, power, validity, and verdict |

Vision proposals are structured and nullable. They contain status, component
IDs/types/regions/polarity/evidence, and connections with uncertainty/evidence.
Do not show uncalibrated confidence percentages; show disagreement or missing
evidence instead.

## 6. Verification checklist

### Automated gates

- [x] Backend suite passes; frontend suite passes.
- [x] Lint is 0 errors and 0 warnings; production build is clean.
- [x] Live smoke passes only in an explicitly network-capable environment,
  with no secrets or image bytes logged.
- [x] Browser smoke covers the complete journey and lazy Reality Lens chunk.

### Manual judging rehearsal

- [x] Clean reload has an understandable mission.
- [x] Misconception path: predict lights → build → observe dark → understand
  contradiction → ask coach → see evidence.
- [x] Consistent path remains accurate and does not invent contradiction.
- [x] Demonstration changes switch, bulb, current, and power together.
- [x] Reality Lens creates a reviewable editable model and requires confirmation.
- [x] Solo makes no coach request and explains why.
- [x] Replay is clean; Auto-demo is a backup, not the default.
- [x] Offline/fallback/error states are honest and recoverable.

## 7. Explicitly deferred

Do not add before the complete path, rehearsal, and recording are stable:

- arbitrary model-controlled canvas editing or unrestricted tool calling;
- uncalibrated confidence or automatic-correctness claims;
- full Biology/Chemistry/Mathematics modules;
- accounts, social feeds, learning analytics, mandatory voice, open chat, 3D,
  or a large new animation system.

## 8. Definition of done

A fresh judge can enter without explanation, make a prediction, build or review
a circuit, see deterministic evidence, understand the Meta AI contribution,
complete one safe demonstration, finish a coach-free Solo transfer, and replay
the journey. Every failure has a truthful recovery path, the exact build is
committed, and the recorded demo matches the submitted build.

## 9. Laboratory phase (headline: Make a prediction. Meet reality.)

Verityn is an AI-guided STEM laboratory; circuits are the first complete
laboratory, not the whole identity. This phase adds the product shell only —
no new laboratories, no new AI capabilities, no solver changes.

### Phase 0 — Baseline and protection (in progress)

- [x] Freeze verified at `6632ad9`: backend 505, frontend 239, lint 0/0,
  build clean, browser smoke passed, no live calls.
- [x] Baseline screenshots current in `docs/demo/` (homepage shots
  recaptured on the frozen tree; 12–15 cover the redesign).
- [ ] Checkpoint commit for any Phase 0 doc updates (owner).
- [x] Phase checklist recorded here; acceptance tests in TEST_PLAN §8.

Phase 0 acceptance: the existing Predict → Build → Reality Check →
Solo → Finale journey and Reality Lens keep working; nothing is
deleted; unfinished Phase 1 work stays disabled or bypassable.

### Phase 1 — Product shell and navigation (implemented, uncommitted)

- [x] Persistent shell: logo + name, Laboratory/Hub, Guided Lab,
  Experiment, Reality Lens, visible current location, in-app
  back/forward, clear Return-to-laboratory action.
- [x] Browser tab reads `Verityn Laboratory` (this supersedes the old
  keep-`index.html`-separate rule).
- [x] Logo assets exported from `VERITYN LOGO.jpeg` (untracked source
  at repo root): header mark 81 KB, badged favicon + apple-touch
  icon; no WebP (no encoder in the toolchain — PNG only).
- [x] Responsive frame `max-w-7xl`: two-column homepage, full-width
  lab workspace and lens page, stacked mobile. Canvas stages use
  the wide frame with React Flow `fitView`; no separate side
  column yet — evidence still stacks below the canvas.
- [x] No major dead zones at 1440px, 1180px, and 390px; every major
  feature reachable without browser Back.
- [x] Existing feature components remain available; full gates +
  smoke re-run and green before any further work.

Phase 1 findings: leaving the journey unmounts its canvases, so
shell/lens navigation clears any latched chapter gate — builds are
re-verified on return while recorded predictions stand (smoke
covers the rebuild-to-re-earn path). The M8 naming audit still
bans bare `Meta AI` in shipped strings, so the homepage names the
precise `Meta Muse Spark` component instead.

### Phase 2 — Reality Lens flagship (implemented, uncommitted)

- [x] Learner-facing name is `Reality Lens` (no `Experimental`
  badge, no `Snap & Build` heading); supporting copy attributes
  proposal to Meta Muse Spark and measurement to Verityn Solver.
- [x] Upload panel stays mounted in every phase; extension
  fallback accepts valid images with an empty MIME type; 4 MB
  limit, unreadable-file, and wrong-type errors are visible; the
  input resets so the same file can be picked twice.
- [x] Order is upload → selected/working → error → verified
  samples → proposal review → solver proof.
- [x] Review defaults to Compare: `Original diagram` + `Detected
  evidence` beside `Interactive circuit replica`, with a `Review
  before testing` gate; overlays and the evidence list select
  both directions by component/connection id.
- [x] Honest proposal states: ready invites review, needs_review
  flags highlighted terminals, unsupported refuses with guidance
  and renders no replica.
- [x] Meta-vision outage state offers Try again, verified sample,
  and Guided Lab return; `Meta vision unavailable` stays separate
  from `Simulator ready`; samples keep working.
- [x] Confirmation copy and proof card restyled; every proof
  value comes from the fresh confirmed solver run.
- [x] Full gates + extended stubbed-proposal smoke re-run and
  green before any further work; no live Meta calls in tests.

Phase 2 findings: the replica mounts on the reveal beat after the
panels, so the smoke waits for (not snapshots) the lock notice.
Honest coverage is unchanged from `vision-breadth.md`: 05 ready,
06 needs_review, 08 next, hand-drawn needs_review,
resistor/AC unsupported.

### Phase 3 — Guided demo (implemented, uncommitted)

- [x] `Watch the guided demo` performs the real journey (same
  screens, solver, ladder, finale): Predict → Build → Reality
  Check → Coach → Demonstrate → Solo → Finale, with a visible
  `Demo playing · <beat> / Step N of 7` bar and Pause, Skip,
  Replay, Try-it-yourself, and Exit controls in the shell.
- [x] Deterministic script (`frontend/src/demo/script.ts`):
  scripted predictions commit through the normal think-first
  path; scripted repairs wire through the normal converter and
  auto-run; the demonstration uses the validated offer + undo.
- [x] Coach ladder auto-asks the real endpoint (R1 → R2 → apply →
  undo → R4); provider badges stay truthful; no scripted coach
  text, so no rehearsal label is needed.
- [x] Solo stays coach-off with zero `/api/coach/*` calls; the
  finale shows real snapshots and claims nothing beyond them.
- [x] Manual prediction input or canvas edits take over: the demo
  exits, the learner's work stands, nothing resets.
- [x] `?auto=1` presenter fallback preserved with its old
  first-heard coached beat; demo gates on R4 instead.
- [x] Full gates + extended smoke (demo run, pause/resume,
  replay, takeover) re-run and green; no live Meta calls.

Phase 3 findings: verdict-subtree remounts reset the card-local
demo flags, so auto-apply and the R4 wait are keyed on the
mount-stable demonstration trace — otherwise the demo re-applies
in a loop and the pending undo never lands. L1's StartVerdict
also renders `Consistent with the model`, so the smoke keys the
apply check on the Undo button instead.
