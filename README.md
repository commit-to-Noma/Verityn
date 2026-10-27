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

## Implemented (Milestones 1–8, M9a Meta coach, Evidence Trace, solo transfer)

- React + Vite + TypeScript frontend with Tailwind CSS 4.
- Flask backend with `GET /api/health` returning `{"status": "ok"}`.
- Frontend health indicator: loading, connected, and error states.
- Frontend integration: a typed API client calls `POST /api/simulate`
  and `POST /api/evaluate` through the Vite proxy. Example circuits can
  be simulated (measurements or an invalid-circuit banner with offender
  IDs) and example predictions checked (verdict rows with deciding
  numbers). Network, HTTP, and malformed-payload failures render as
  error rows with retry; aborted requests stay silent.
- Prediction screen + fixed L1 lesson pack (`src/verityn/lessons/l1.json`):
  the learner sees the broken starting circuit, must choose Yes, No,
  or Not sure plus an optional one-line Why, then proceeds to the
  canvas to fix the circuit with one wire. The broken start's outcome
  lives in the pack; the evaluator is never asked to judge it.
- L1 Twist (open switch): unlocked after the L1 circuit simulates at the
  expected 0.6 A / 3.6 W. Fresh prediction on the repaired-but-open
  circuit, independent rebuild on a fresh canvas, verdict from the
  existing evaluator against the learner's own built netlist.
- Coach interface with Meta Spark primary + template fallback (M8/M9a):
  after a contradicted Twist verdict the learner can ask for one R1
  guiding question. Eligibility is derived server-side from the recorded
  prediction and a fresh solve; model output must match a constrained
  JSON schema and pass leak/number guards or the template serves instead.
  Sessions are in-memory only, so a backend restart clears them.
- Evidence Trace: per-challenge timeline of prediction, built circuit,
  solver outcome, comparison, and coaching, derived from existing
  client state. It shows observed simulation evidence, not proof of
  mastery.
- Solo transfer (second bulb): unlocked after the Twist circuit meets its
  pack values. A new parallel-branch prediction and build with the AI
  coach fully off — no session is recorded and the backend rejects the
  transfer challenge id.
- Buildable circuit canvas (React Flow): place batteries, bulbs, and
  switches (each switch toggles open/closed), drag between terminals
  to add wires, delete parts, and run the circuit. Results show
  measurements with lit-bulb glow, or name the
  problem with the offending parts outlined. Canvas circuits convert
  to netlists client-side; all physics stays server-side.
- Deterministic circuit solver + validator (`src/verityn/solver.py`):
  battery, resistor, bulb (fixed 10 Ω), switch, and wire circuits solved
  with modified nodal analysis; rejected circuits return an error code,
  a message, and the offending component ids instead of numbers.
- Deterministic prediction evaluator (`src/verityn/evaluator.py`):
  judges `lit` and `compare_brightness` claims against solver output as
  CONSISTENT, CONTRADICTED, or UNASSESSABLE, with model-derived evidence.
- Flask API: `POST /api/simulate` takes a bare netlist and returns the
  solver result; `POST /api/evaluate` takes `{"claim", "netlist"}`,
  solves server-side, and returns both result and verdict. Judged
  outcomes return HTTP 200; malformed requests return HTTP 400
  `MALFORMED_REQUEST`; unknown routes and methods return JSON errors.
- Backend tests for the health endpoint, solver, evaluator, and API.
- Pinned backend dependencies (`backend/requirements.txt`).

## Roadmap (hackathon submission: Nov 4, 9:00 PM ET)

Locked-in priorities, in order. Nothing below outranks a reliable demo.

1. **Priority 1 — Reliable demo & framing (essential).**
   L1 → Twist → Transfer end-to-end browser loop verified; solver vs. AI
   responsibilities made explicit in the UI; Evidence Trace framed as
   proof of observed simulation, never proof of mastery; existing
   defects fixed before any new complexity.
2. **Priority 2 — Multimodal "Snap & Build" (high-value stretch).**
   Learner uploads a schematic or hand-drawn photo; Muse Spark Vision
   extracts a candidate netlist shown as a JSON preview. Guardrail: the
   learner must review and confirm before it ever reaches the solver —
   the model never directly controls solver state.
3. **Priority 3 — Physics brought to life (visual polish).**
   Bulb glow scaled continuously by solver-computed power (P = I²R);
   wire current animation (SVG stroke-dash) active only when the solver
   calculates current > 0, freezing the moment a switch opens;
   component highlights restricted to IDs grounded in validated solver
   evidence — no speculative smoke or broken-node effects.
4. **Priority 4 — Voice & visual coaching (optional).**
   Muse Voice Transcribe for voice explanations of learner predictions;
   coach-requested component highlights validated strictly against the
   canvas netlist.

Infrastructure: the Meta Model API (Muse Spark) stays the primary
integration. External open-weight hosting (Baseten/Modal) is deferred
until the primary browser demo is rock-solid.

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
To use Meta Spark with template fallback, set `MODEL_API_KEY` in an
untracked `.env` file at the repo root, then start the backend normally;
recorded predictions and Why text are sent to the Meta Model API only
in that mode. `VERITYN_COACH_FAIL=1` forces the provider-failure path
for local testing. The automated suites mock all model HTTP and never
spend credits.

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
The status card reads “Backend connected” when both servers run; stop the
backend and it shows the error state with a retry button.

## Checks

```sh
cd frontend && npm test         # frontend unit tests (vitest)
cd frontend && npm run build   # typecheck + production build
python -m pytest backend/tests -q   # backend tests (venv active)
```

## Built with Muse Code

The deterministic solver, prediction evaluator, validation guards, Flask
API, lesson packs, and the backend/frontend test suites were built with
Muse Code (agentic CLI, Meta Muse Spark) under human direction: the human
set every milestone scope, reviewed each diff, ran the live API
diagnostics, and made all product decisions. No application code was
copied from outside the project.

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
