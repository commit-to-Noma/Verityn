# Verityn — Predict. Build. Reality check.

A coach that steps back: learners predict what a circuit will do, build it,
and compare against a deterministic simulation — with AI help that fades out.
See `docs/` for the architecture, UI spec, and test plan.

## Implemented (Milestones 1–6: scaffold, solver, evaluator, API, integration, canvas)

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

## Not yet implemented

Switches and resistors on canvas, prediction-on-canvas, learning
flow, help ladder, Meta AI integration, solo mode, persistence,
deployment. Canvas predictions and free-form values arrive later.

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

## Notes

- No API keys or secrets exist yet; when they do, they stay server-side in
  an untracked `.env` file, never in the frontend or Git history.
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
