# Verityn: demo brief for video production (Phase 1 analysis)

Status: current as of Nov 3, 2026 (commit `322e482`). Everything below
was verified against the running app, the test suites, or the repo, not
from memory. Numbers: 647 backend + 627 frontend tests green, lint 0
errors, production build clean, full browser smoke green on dev and on
the exact production build.

## 1. What Verityn is

Verityn is a STEM laboratory where learners test their own ideas
against a real circuit simulator, coached by bounded Meta AI. The
core loop: predict what a circuit will do, build it, measure it, and
only then hear from the AI coach. The AI never gives answers. It asks
questions, points at evidence, and withdraws completely for the Solo
transfer challenge. Hub tagline: "Imagine it. Test it. Understand it."

Recommended track: **Push the Frontier**. Verityn gives a machine a
new capability (a coach provably restrained by physics) and offers a
better way to understand and control a physical system. Note the
anti-project list bans "simple AI for Education chatbots." The video
must position Verityn as the opposite: a simulator that judges, with
AI fenced in by measurements. Education framing alone risks a
pattern-match dismissal.

## 2. Fully implemented (safe to show on camera)

Guided Lab: Predict with locked Yes/No/Not sure plus spoken or typed
reasons; Build with drag-to-wire canvas and solver-tested gates;
Reality Check with contradiction, one coach follow-up, and a Solo
gate that unlocks only on a part-naming reply (voice or saved line)
or a close-then-reopen retest excursion; R1/R2/R4 coach ladder with
consented demonstration (flips the switch on the learner canvas,
undo restores); Solo second-bulb transfer with server-enforced zero
coach calls; Finale with journey review, one-sentence reflection,
solver-grounded Spark explanations, and a shareable evidence card.

Reality Lens: upload, drop, paste, camera, or sketchpad input with
insulated-trace mode; vision proposals in a three-column review
cockpit; mandatory confirm-before-solve; sample diagrams with
tappable saved SAM 3.1 segments.

Experiment Bay: missions drawer, five starter presets (Time Bomb,
Polarity Duel, Dim Duo, Forbidden Wire, Parallel Power), paced
voltage sweep with analog gauge and replay slider, run history with
honest labels, grounded "Ask Muse Spark about this result."

Platform: Hub with STEM orbit, tools turntable, method timeline,
four-engine console with live traces and try-its; startup progress
with retry; checkpoint resume; Trace drawer on every AI surface;
guided auto-demo that performs the journey in 38 seconds.

## 3. Partially implemented (handle with care on camera)

- SAM 3.1 is **sample-only**. A 30-request spike ran Oct 28 and
  failed its gate (2 of 10 vs 7 required), so live use was halted
  honestly. UI says "no live SAM 3.1 call is made." Say it proudly.
- Only the circuits module is live. Science, Technology, and Math
  are roadmap peeks, not product. Present one deep module, not a
  platform.
- Voice transcription needs a mic and a keyed backend.
- Coach sessions live in memory per backend instance. Fine for
  single-user judging; documented as the known serverless limit.

## 4. Opening experience

Dark laboratory Hub: reactive STEM orbit backdrop, five-station
tools turntable (keyboard accessible, real routes), "01 The method"
loop timeline, "02 Under the hood" diagnostic console, "03 Why
Verityn matters" ledger, health badge. One CTA: "Start your own lab"
with a five-second swoosh into the Guided Lab.

## 5. Complete learner journey (click by click)

Predict (lock Yes/No/Not sure, optional reason) -> Build (wire the
canvas, test, match to advance) -> Reality Check (predict, test,
contradiction at 0 A / 0 W, answer the coach question, optional
demonstration, gate unlocks) -> Solo (new circuit, no coach,
independent proof) -> Recap (per-circuit review, reflection,
explanation, evidence card).

## 6. Meta integration (exact statuses for narration)

- Muse Spark: live with `MODEL_API_KEY` (R1 questions, Finale
  explanations, Lens proposals, Bay answers); deterministic
  fallback templates without it. Provider badge names what served
  each response. No key reaches the frontend bundle (verified).
- Muse Voice Transcribe: live speech-to-text with silence stop and
  per-stage timings; requires key and mic.
- SAM 3.1: sample-only, no live inference. Saved provenance only.
- Speech playback is browser-native, labeled as such everywhere.
  Never call it Meta TTS.
- Guards: number guard (words must match readings), leak guard
  with one retry, server-enforced zero-coach Solo.

## 7. Architecture (for the credibility beat)

Vite + React 19 + Tailwind frontend; Flask backend over
`src/verityn/` (solver, evaluator, coach, providers). The
deterministic solver and evaluator judge every run locally; Meta
calls only draft words about measured numbers. Deploy: Vercel
same-origin static plus one Python function, relative `/api/*`
paths, secrets server-side only. See `docs/SUBMISSION.md` (Deploy)
and `docs/ARCHITECTURE.md`.

## 8. What makes Verityn different

Education AI answers first and checks nothing. Verityn inverts it:
the learner predicts first, the simulator judges, the coach only
questions, and the final challenge removes the coach entirely.
Every AI sentence is grounded in a solver reading or labeled as a
fallback. Productive failure is the mechanic. Thesis line for the
video: "The learner predicts first, the simulator judges, the AI
coaches only from evidence, and the final challenge removes the AI."

## 9. Visual moments worth footage

Bulb overload shake then explosion with flash frame; sweep gauge
needle with replay slider; "Prediction did not match" flip; reply
box unlocking Solo; R2 demonstration flipping the switch live;
Solo gate with coach off; STEM orbit reacting to field selection;
Lens photo-to-replica confirm; evidence card reveal. Quiet
judge-friendly shots: Trace drawer, provider badges, the honesty
line about SAM.

## 10. Limitations (what the video must not claim)

No live segmentation. No Meta TTS. No multi-physics content. No
classroom pilot data. No open-weights serving. Every claim in the
video must be clickable in the live app, since judges get code plus
product alongside the video.

## 11. Recommended 3-minute structure

Hook with the explosion and thesis (0:00-0:20); one full
predict-build-contradiction arc ending on the locked gate
(0:20-1:10); bounded AI with Trace close-up (1:10-1:50); Lens and
Bay range at 15 seconds each (1:50-2:25); Solo plus evidence card
as the emotional arc (2:25-2:50); honest close naming the track
(2:50-3:00). Chat must never lead; the simulator judges first in
every act.

## 12. Production facts

Record keyed per `docs/DEMO_SCRIPT.md` (live providers, Meta
badges visible, no secrets in frame). Deploy: Vercel from repo
root, `main` branch, `MODEL_API_KEY` set, then verify `/api/health`
and one full journey before rolling. Screenshots in `docs/demo/`
predate the latest copy pass; recapture owner-side.
