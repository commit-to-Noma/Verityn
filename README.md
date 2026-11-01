# Verityn  -  A STEM laboratory for thinking first

Verityn is an evidence-first learning platform for **Science, Technology,
Engineering, and Mathematics**. Its purpose is broader than any one subject:
learners make a prediction, build or interpret a model, test it against
evidence, and explain what they observe.

**Engineering circuits are the first live module**, not the definition of the
platform. The guided circuit lab demonstrates Verityn's learning loop today;
Science, Technology, and Mathematics are future learning pathways, clearly
labelled as such in the interface.

The system keeps reasoning and measurement distinct: a deterministic
modified-nodal-analysis solver establishes circuit ground truth, while Meta
Muse Spark guides Socratic reasoning. It is not a chatbot tutor: there is no
open chat, predictions are constrained, verdicts are derived server-side, the
model never touches physics, and Solo removes AI assistance entirely. Model
outputs are proposals and pass grounded evidence verification before reaching
the learner. See `docs/` for the architecture, UI spec, product plan, and test
plan.

## Features

- Guided lab: Predict → Build → Reality Check → Solo → Finale.
  The learner commits to a Yes / No / Not sure prediction with a
  one-line Why, repairs the open-gap circuit (0.6 A / 3.6 W lit),
  meets the open-switch contradiction (0.0 A dark), climbs the
  Question → Pointer → Demonstration coach ladder, and tries a fresh
  second-bulb circuit without the coach.
- Socratic coach ladder: one Question grounded in the measured
  numbers, a Pointer citing the 0.0 A open-switch discrepancy, and a
  Demonstration confirmation. Served
  by Meta Muse Spark when a key is configured, otherwise by the
  labeled deterministic fallback. Eligibility is derived
  server-side; Solo makes zero coach calls, enforced by the
  backend as well as the UI.
- Validated AI demonstrations: the coach may propose closing S1
  from a closed action vocabulary; the app validates, previews,
  applies, re-solves, and offers Undo. Invalid actions never
  mutate state.
- Reality Lens: upload a schematic or photo (or use a verified
  sample); Meta Spark Vision proposes components, connections,
  polarity, and provenance; the learner reviews the original
  beside the editable replica in Compare mode and must confirm
  before the solver runs. `needs_review` and `unsupported`
  diagrams are refused honestly  -  nothing is guessed.
- Experiment bench: free-form canvas with five starter presets,
  explicit runs, session-local history with current-vs-previous
  comparison, and an optional solver-first explanation.
- Overload physics (simplified classroom model): rated bulbs
  (6 V / 6 W defaults), assessed intact/overloaded/damaged
  conditions, per-battery voltage controls, and a session
  damage latch  -  12 V measures 1.2 A / 14.4 W overloaded, the
  next run latches damaged at 0.0 A, reset restores intact.
- Guided demo: `Play the guided demo` performs the whole
  journey through the real UI in ~40 seconds (pause, resume,
  skip, exit, replay, manual takeover). This is the recording
  path for the 60–90 second video.
- STEM homepage: a selectable four-discipline orbital map with
  Engineering circuits marked as the first live module, plus an
  interactive five-station turntable (Guided Lab, Experiment Bay,
  Reality Lens, Meta Muse Spark, Verityn Solver). The existing
  side-arrow, keyboard, screen-reader, reduced-motion, and
  no-auto-rotation interactions are preserved.
- Voice (optional, never required): tap-to-talk coach replies and a
  microphone in every Why box. Meta Muse Voice Transcribe turns each
  recording into editable text; a clear spoken answer pre-selects the
  matching choice but never submits. Spoken coach playback is browser
  speech synthesis, defaults off, and uses a ranked English browser voice
  with short sentence pauses (Meta Muse Voice Transcribe is not text-to-speech).
  Typing and manual lab controls remain available.
- Deterministic MNA solver (`src/verityn/solver.py`): battery,
  resistor, bulb (fixed 10 Ω), switch, and wire circuits;
  rejected circuits return an error code plus offender ids,
  never invented numbers. The evaluator (`evaluator.py`) judges
  `lit` / `compare_brightness` claims as CONSISTENT,
  CONTRADICTED, or UNASSESSABLE with model-derived evidence.
- Flask API: `POST /api/simulate`, `POST /api/evaluate`,
  `POST /api/coach/predict`, `POST /api/coach/ask`,
  `POST /api/coach/conversation`, `POST /api/voice/transcribe`,
  `POST /api/coach/explain`, `POST /api/vision/propose`.
  Judged outcomes return HTTP 200; malformed requests return
  HTTP 400 `MALFORMED_REQUEST`; errors are JSON, never
  tracebacks; keys stay server-side in an untracked `.env`.
- Test suites (mocked model HTTP, zero live calls in tests):
  backend and frontend suites, lint, production build, plus
  `scripts/smoke_live.py` and `scripts/smoke_browser.mjs` end-to-end checks.
- Pinned backend dependencies (`backend/requirements.txt`).

## Smart details

| Behavior | Where to see it | Test or trace |
|---|---|---|
| Spoken correction of a choice | Predict, Reality Check, and Solo | [Spoken prediction tests](./frontend/src/voice/spokenPrediction.test.ts) |
| Coach replies use the learner's own words | Coach Dock follow-up | [Meta coach tests](./backend/tests/test_meta_coach.py) |
| Solver-grounded explanations with a number guard | Experiment Bay and Finale | [Explanation tests](./backend/tests/test_explain.py) |
| Leak guard and one validation retry | R1 coach question | [Retry trace test](./backend/tests/test_trace.py) |
| Stale-state protection for cancelled or superseded requests | Reality Lens and circuit runs | [API cancellation tests](./frontend/src/api/client.test.ts) |
| Honest `needs_review` and `unsupported` Reality Lens proposals | Reality Lens review | [Vision validation tests](./backend/tests/test_vision.py) |
| Server-enforced Solo with zero coach calls | Solo second-bulb challenge | [Transfer tests](./backend/tests/test_transfer.py) |
| Typed errors with actionable next steps | API responses and learner notices | [Error-safety tests](./backend/tests/test_error_safety.py) |
| Prediction lock-in with a short undo window | Voice replies in every stage | [Spoken prediction tests](./frontend/src/voice/spokenPrediction.test.ts) |
| Ranked English browser voice with measured pacing | Coach Dock playback | [Coach voice tests](./frontend/src/voice/coachVoice.test.ts) |
| Current flow and bulb glow follow solver measurements | Circuit test result | [Visual mapping tests](./frontend/src/canvas/visuals.test.ts) |
| Solver readouts count up to the measured value | Guided result card and circuit readouts | [Readout tests](./frontend/src/components/ReadoutValue.test.ts) |
| Finale circuits reveal in order with reduced motion respected | Finale timeline | [Finale motion tests](./frontend/src/journey/finaleMotion.test.ts) |

## Deliberately out of scope

- No login, accounts, persistence, or analytics; history is
  session-local.
- No open chat: predictions are constrained choices and the
  model never touches physics.
- No mastery/dependency scores: the finale shows observed
  session evidence only.
- No resistor canvas node (the solver accepts resistors but
  the palette does not place them).
- Full Science, Technology, and Mathematics subject modules are
  future pathways, not lessons already shipped. Engineering
  circuits are the first live module; broader engineering systems
  remain future work.
- External open-weight hosting (Baseten/Modal) deferred.

## Prerequisites

- Node.js 20.19+ or 22.12+ (required by Vite).
- Python 3.10+.

## Setup

Backend (from the repo root):

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Frontend:

```sh
cd frontend
npm install
```

## Coach providers

Coaching defaults to fixed fake templates (no network, no key needed).
To use Meta Spark with template fallback, export `MODEL_API_KEY` in the
backend's shell (e.g. `export MODEL_API_KEY=...`), then start the
backend normally; recorded predictions and Why text are sent to the
Meta Model API only in that mode. The backend does not auto-load
`.env` files  -  if you keep the key in an untracked root `.env`, source
it into the environment first, and never commit it. The same key also
enables Meta vision proposals. `VERITYN_COACH_FAIL=1` forces the
provider-failure path for local testing. The automated suites mock all
model HTTP and never spend credits.

## Launch

Terminal 1  -  backend (from the repo root):

```sh
source .venv/bin/activate
python backend/app.py
```

Backend listens on http://127.0.0.1:5000.

Terminal 2  -  frontend:

```sh
cd frontend
npm run dev
```

Open the printed local URL (usually http://localhost:5173) in a browser.
The status badge reads “Simulator ready” when both servers run; stop the
backend and it shows the error state with a retry button.

## Checks

```sh
cd frontend && npm test         # frontend unit tests (vitest)
cd frontend && npm run build   # typecheck + production build
python -m pytest backend/tests -q   # backend tests (venv active)
python scripts/smoke_live.py   # live judging-path smoke check (venv active)

# With the backend and a frontend dev server running:
BASE=http://localhost:5174 node scripts/smoke_browser.mjs   # full browser journey
```

## Built with Meta

| Tool | Used for | Evidence |
|---|---|---|
| Muse Spark | R1 coach questions, solver-grounded explanation drafts, and Reality Lens vision proposals | [Trace and validation notes](./docs/INTELLIGENCE_LOG.md) |
| Muse Voice Transcribe | Speech-to-text for Predict, Reality Check, and Solo | [Voice API notes](./docs/ARCHITECTURE.md) |
| SAM | Sample only; no live inference | [Sample probe results](./docs/sam-spike-results.json) |

Pointer and Demonstration are deterministic by design, not model calls. SAM is
sample-only; no live SAM inference is used.
Browser speech playback is browser-native, not Meta text-to-speech.
Provider labels and trace rows
identify the provider that actually served each response.

## Notes

- API keys stay server-side in an untracked `.env` file, never in the
  frontend or Git history.
- Vite proxies `/api/*` to the Flask backend during development.
- Lucide icons use current canonical names (`CircleCheckBig`, `CircleX`,
  `LoaderCircle`); the spec doc predates the rename.
- The UI font stack lists Space Grotesk / JetBrains Mono first with system
  fallbacks; the fontsource packages arrive with the first real screens.

## Troubleshooting

If `npm` fails with `EPERM` on `~/.npm` (root-owned cache from an old npm
bug), fix ownership once with `sudo chown -R $(id -u):$(id -g) ~/.npm`,
or run npm with a disposable cache: `npm_config_cache=/tmp/npm-cache npm …`.

If Run Simulation reports HTTP 404, the process on port 5000 is a stale
backend that predates the API routes: stop it (Ctrl-C in its terminal, or
find it with `lsof -iTCP:5000 -sTCP:LISTEN` and `kill` it), then start the
backend fresh from the repo root with `source .venv/bin/activate` and
`python backend/app.py`. A tell-tale sign is "Address already in use" when
starting the backend (the stale process still holds the port), or an HTML
404 page  -  the current backend answers unknown API routes with JSON.
