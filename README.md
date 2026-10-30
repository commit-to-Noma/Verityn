# Verityn — Predict. Build. Reality check.

Verityn is a simulation-grounded, AI-guided circuit-learning system with a
neuro-symbolic division of responsibilities: a modified-nodal-analysis solver
establishes physical ground truth, Muse Spark guides Socratic reasoning, and
the learner must predict, build, and transfer. It is not a chatbot tutor:
there is no open chat, predictions are constrained choices, verdicts are
derived server-side from the solver, the model never touches physics, and a
solo stage removes AI assistance entirely. Model outputs are treated as
proposals and pass grounded evidence verification — schema checks, leak
checks, and numbers allowed only from solver facts — before reaching the
learner. See `docs/` for the architecture, UI spec, and test plan.

## Implemented (submission state)

- Guided lab: Predict → Build → Reality Check → Solo → Finale.
  The learner commits to a Yes / No / Not sure prediction with a
  one-line Why, repairs the open-gap circuit (0.6 A / 3.6 W lit),
  meets the open-switch contradiction (0.0 A dark), climbs the
  R1 → R2 → R4 coach ladder, and proves transfer on a fresh
  second-bulb circuit with the coach fully off.
- Socratic coach ladder: one R1 guiding question grounded in the
  measured numbers, an R2 evidence pointer citing the 0.0 A
  open-switch discrepancy, and an R4 confirmation check. Served
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
  diagrams are refused honestly — nothing is guessed.
- Experiment bench: free-form canvas with five starter presets,
  explicit runs, session-local history with current-vs-previous
  comparison, and an optional solver-first explanation.
- Overload physics (simplified classroom model): rated bulbs
  (6 V / 6 W defaults), assessed intact/overloaded/damaged
  conditions, per-battery voltage controls, and a session
  damage latch — 12 V measures 1.2 A / 14.4 W overloaded, the
  next run latches damaged at 0.0 A, reset restores intact.
- Guided demo: `Watch the guided demo` performs the whole
  journey through the real UI in ~40 seconds (pause, resume,
  skip, exit, replay, manual takeover). This is the recording
  path for the 60–90 second video.
- Voice (optional, never required): browser speech synthesis
  reads coach messages with captions and replay; microphone
  dictation fills the Why field as editable text with honest
  unsupported/denied states.
- Deterministic MNA solver (`src/verityn/solver.py`): battery,
  resistor, bulb (fixed 10 Ω), switch, and wire circuits;
  rejected circuits return an error code plus offender ids,
  never invented numbers. The evaluator (`evaluator.py`) judges
  `lit` / `compare_brightness` claims as CONSISTENT,
  CONTRADICTED, or UNASSESSABLE with model-derived evidence.
- Flask API: `POST /api/simulate`, `POST /api/evaluate`,
  `POST /api/coach/predict`, `POST /api/coach/ask`,
  `POST /api/coach/explain`, `POST /api/vision/propose`.
  Judged outcomes return HTTP 200; malformed requests return
  HTTP 400 `MALFORMED_REQUEST`; errors are JSON, never
  tracebacks; keys stay server-side in an untracked `.env`.
- Test suites (mocked model HTTP, zero live calls in tests):
  564 backend tests, 337 frontend tests, lint clean,
  production build clean, plus `scripts/smoke_live.py` and
  `scripts/smoke_browser.mjs` end-to-end checks.
- Pinned backend dependencies (`backend/requirements.txt`).

## Deliberately out of scope

- No login, accounts, persistence, or analytics; history is
  session-local.
- No open chat: predictions are constrained choices and the
  model never touches physics.
- No mastery/dependency scores: the finale shows observed
  session evidence only.
- No resistor canvas node (the solver accepts resistors but
  the palette does not place them).
- Biology/Chemistry/Engineering labs are honest `Planned`
  labels, not lessons.
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
`.env` files — if you keep the key in an untracked root `.env`, source
it into the environment first, and never commit it. The same key also
enables Meta vision proposals. `VERITYN_COACH_FAIL=1` forces the
provider-failure path for local testing. The automated suites mock all
model HTTP and never spend credits.

## Launch

Terminal 1 — backend (from the repo root):

```sh
source .venv/bin/activate
python backend/app.py
```

Backend listens on http://127.0.0.1:5000.

Terminal 2 — frontend:

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

## Built with Muse Code

The deterministic solver, prediction evaluator, validation guards, Flask
API, lesson packs, and the backend/frontend test suites were built with
Muse Code (agentic CLI, Meta Muse Spark) under human direction: the human
set every milestone scope, reviewed each diff, ran the live API
diagnostics, and made all product decisions.

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
404 page — the current backend answers unknown API routes with JSON.
