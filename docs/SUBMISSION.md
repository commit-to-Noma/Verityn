# Verityn — Submission Checklist

Deadline: Nov 4, 9:00 PM ET. Checked items are verified on the final
tree; unchecked items need the human owner (recording, upload).

## Code and verification

- [x] Backend tests pass (564).
- [x] Frontend tests pass (337).
- [x] Lint clean (0 warnings, 0 errors).
- [x] Production build clean.
- [x] `scripts/smoke_live.py` passes (ladder + solo zero-coach).
- [x] `scripts/smoke_browser.mjs` passes against a fresh backend
      (journey, lens stubs, demo, experiment, overload, regression).
- [x] Exact production build served and smoke-tested (see below).
- [x] Copy freeze: no legacy/placeholder wording in learner UI.
- [x] Screenshots recaptured on the final tree (`docs/demo/21–26`).
- [x] No live Meta calls in any test or smoke script.
- [x] No secrets in the tree or history (`.env` untracked/ignored).
- [x] `notes/review.md` and the raw logo stay out of the commit.

## Submission package

- [x] README describes the submission state honestly.
- [x] Pitch deck script (`docs/PITCH.md`).
- [x] 60–90 s recording plan (`docs/DEMO_SCRIPT.md`); guided demo
      timed at 38 s end to end.
- [ ] Video recorded, reviewed, and backed up (owner action).
- [ ] Submission form filled and files uploaded (owner action).

## Exact-build verification

How the production build was tested (not just the dev server):

```sh
# Terminal 1 — backend
source .venv/bin/activate
python backend/app.py            # :5000, fake providers

# Terminal 2 — production frontend
cd frontend
npm run build
npm run preview -- --host 127.0.0.1 --port 5173   # serves dist/

# Terminal 3 — browser smoke against the exact build
BASE=http://127.0.0.1:5173 node scripts/smoke_browser.mjs
```

`vite preview` uses the same `/api` proxy as development (see
`vite.config.ts`), so the served build talks to the fresh backend
exactly as judges will run it.
