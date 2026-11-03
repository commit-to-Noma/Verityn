# Verityn  -  Demo recording plan (core 80 s inside the 3-minute video)

The guided demo performs the real journey in 38 seconds (timed on the
submission tree), leaving room for a spoken intro and outro. Record at
1440×900 with the backend running and `.env` loaded, so the recording
shows the live providers with honest labels (Meta where Meta serves,
fallback where fallback serves).

## Setup (before recording)

1. Fresh backend from the repo root: `source .venv/bin/activate`, then
   `python backend/app.py` (port 5000, `.env` loaded so MODEL_API_KEY
   selects the live providers).
2. Fresh frontend: `cd frontend && npm run dev`, open the printed URL.
3. Confirm the hub shows `Simulator ready` and close other tabs.
4. Confirm one live label before rolling: serve any coach rung and
   check the provider badge reads Meta Spark, not Fallback coach.

## Recording beats

| Time | Visual | Narration |
|---|---|---|
| 0:00–0:12 | Hub: `Imagine it. Test it. Understand it.` + laboratory turntable | "Students get answers from AI without learning. Verityn is a laboratory: rotate the stations, then enter the guided lab and predict first  -  the simulator, not the AI, decides what happened." |
| 0:12–0:50 | Click `Watch the guided demo`. Predict → repair at 0.6 A / 3.6 W → open-switch contradiction at 0.0 A → coach question → S1 demonstration → solo proof. | "Watch: a prediction, a real repair, a contradiction the coach questions with measured numbers, one validated demonstration  -  then a fresh circuit solved independently in Solo." |
| 0:50–1:10 | Finale evidence cards; quick cut to the Experiment overwork bench (18 V → 32.4 W overworked, past 18 V explodes). | "The finale reports what happened  -  never a score. And the free bench measures overwork physics the same deterministic way." |
| 1:10–1:20 | Back to hub. | "Verityn: the AI asks the question, the simulator supplies the evidence, you make the meaning." |

Extend to 3 minutes per the video structure (hook, full loop,
bounded AI with Trace close-up, Lens + Bay range, Solo arc, honest
close). The table above is the recorded core all versions share.

## After recording

- Watch it back once: provider labels honest, Meta badges visible on
  the keyed path, no localhost secrets in frame, numbers match the
  script (0.6 A / 3.6 W, 0.0 A, 32.4 W).
- Keep the file under the submission size limit; keep a backup copy.
