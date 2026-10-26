# Verityn — Predict. Build. Prove.

A coach that steps back: learners predict what a circuit will do, build it,
and compare against a deterministic simulation — with AI help that fades out.
See `docs/` for the architecture, UI spec, and test plan.

## Implemented (Milestones 1–3: scaffold, solver, evaluator)

- React + Vite + TypeScript frontend with Tailwind CSS 4.
- Flask backend with `GET /api/health` returning `{"status": "ok"}`.
- Frontend health indicator: loading, connected, and error states.
- Deterministic circuit solver + validator (`src/verityn/solver.py`):
  battery, resistor, bulb (fixed 10 Ω), switch, and wire circuits solved
  with modified nodal analysis; rejected circuits return an error code,
  a message, and the offending component ids instead of numbers.
- Deterministic prediction evaluator (`src/verityn/evaluator.py`):
  judges `lit` and `compare_brightness` claims against solver output as
  CONSISTENT, CONTRADICTED, or UNASSESSABLE, with model-derived evidence.
- Backend tests for the health endpoint, solver, and evaluator.
- Pinned backend dependencies (`backend/requirements.txt`).

## Not yet implemented

Canvas and circuit building, prediction flow, help ladder, Meta AI
integration, solo mode, persistence, deployment. Nothing in the UI beyond
the scaffold screen exists yet, and neither solver nor evaluator is yet
wired to any API route.

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
cd frontend && npm run build   # typecheck + production build
python -m pytest backend/tests -q   # backend smoke tests (venv active)
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
