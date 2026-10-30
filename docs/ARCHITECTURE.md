# Verityn: Architecture (as built + locked roadmap)

The current feature checklist, UI inventory, model boundaries, and remaining
work are maintained in [PRODUCT_PLAN.md](./PRODUCT_PLAN.md).

Concept: **an evidence-first STEM learning platform.** Engineering
circuits are its first live module and the first demonstration domain for
the wider predict → build → test → explain → transfer method. The
neuro-symbolic division of responsibilities keeps physical ground truth in
the deterministic modified-nodal-analysis solver while Muse Spark guides
Socratic reasoning. This is not a chatbot tutor  -  there is no open chat, and
the model never touches physics.

Submission deadline: Nov 4, 9:00 PM ET. Roadmap tiers below are
locked in priority order; nothing outranks a reliable demo.

## 1. Principles

1. **Code owns facts and progression.** Physics, verdicts, unlock
   gates, and whether the AI is allowed to speak are decided by code.
2. **The model owns phrasing within constraints.** It drafts one
   guiding question per coaching request; everything else about the
   interaction is code-determined.
3. **Every model output is a proposal.** It passes grounded evidence
   verification  -  constrained JSON schema, closed misconception ids,
   leak checks, numbers only from solver facts  -  before reaching the
   learner. Anything rejected falls back to fixed templates.
4. **No decorative AI.** Every model call must change what the app
   does. Docs and UI state which parts are plain code.
5. **No invented claims.** No growth scores, no "proof of learning",
   no mastery badges. The Evidence Trace shows observed simulation,
   never learning outcomes. We do not claim zero hallucinations; we
   claim verification before display.

## 2. The learning loop (as built)

```
predict (constrained Yes / No / Not sure + one-line Why; choice required)
   |
   v
build (React Flow canvas: battery, bulb, switch, wires; client converts
       to a netlist; seeds fix component ids for judgeable claims)
   |
   v
simulate (POST /api/simulate -> solver verdict: measurements or an
          error code with offender ids; never invented numbers)
   |
   v
compare (Reality Check/Transfer: POST /api/evaluate judges the recorded claim
         against the built netlist as CONSISTENT / CONTRADICTED /
         UNASSESSABLE. L1 compares against the pack's solver-verified
         start expectation, which the evaluator refuses to judge.)
   |
   v
coach (Reality Check only, contradicted verdicts only: POST /api/coach/ask.
      Eligibility is derived server-side from the stored prediction
      plus a fresh solve. Meta Spark primary, template fallback.)
   |
   v
transfer (solo second-bulb parallel task; coach fully off: no session
         is recorded and the backend rejects the transfer id)
```

Evidence Trace (client-side, derived from existing state): prediction,
built circuit, solver outcome, comparison, coaching, demonstrations, and
solo. Unlocks: Reality Check requires the L1 circuit at pack values; transfer
requires the Reality Check circuit at pack values. All gates are build-based, never
prediction-correctness-based, so a wrong guess never deadlocks.

## 3. Modules

| File | Purpose |
|---|---|
| `src/verityn/solver.py` | MNA circuit solver + validator. Truth. |
| `src/verityn/evaluator.py` | Claim verdicts with model-derived evidence. |
| `src/verityn/coach.py` | Session store, eligibility derivation, guards, pack loading. |
| `src/verityn/fake_coach.py` | Fixed template provider (fallback; honest prototype label). |
| `src/verityn/meta_coach.py` | Meta Spark provider: structured output, strict validation. |
| `src/verityn/lessons/*.json` | Lesson packs (challenge, seeds, verified expectations). |
| `backend/app.py` | Flask routes, JSON error handlers, provider wiring. |
| `frontend/src/lessons/` | Engine (predictions, gates, trace builder) + pack loaders. |
| `frontend/src/components/` | Prediction, canvas, verdict, trace, coach UI. |

## 4. Model jobs (only what code cannot do)

| Job | Model | Guardrails |
|---|---|---|
| Draft one R1 guiding question | Spark 1.3, `response_format` JSON Schema | Closed id enum, question-form, leak list, facts-only numbers; reject → template |
| (P2) Read a schematic/photo into a candidate netlist | Spark Vision | JSON preview; learner must review and confirm; solver only ever sees confirmed netlists |
| (P4) Transcribe voice explanations | Voice Transcribe | Transcript is input text only; never a verdict |

Not used: open chat, emotion detection, growth scoring, second-opinion
models, decorative image generation.

## 5. Failure behaviour

1. All models up: full experience with Meta-drafted questions.
2. Spark down, slow, or credits gone: template fallback serves; solver,
   evaluator, gates, and transfer unaffected.
3. All AI off: the whole loop still completes, including solo transfer.
4. Backend down: the UI shows transport errors with retry; nothing is
   faked locally.

Diagnostics are sanitized by design: logs carry stage codes, HTTP
statuses, and structural shape metadata only  -  never keys, prompts,
response bodies, or model text.

## 6. Roadmap (locked tiers)

1. **Reliable demo & framing.** Verified L1 → Reality Check → Transfer
   browser loop; solver-vs-AI responsibilities explicit in the UI;
   trace framed as observed evidence; defects fixed before complexity.
2. **Multimodal "Reality Lens".** Vision-proposed netlist preview +
   mandatory learner confirmation gate. The reviewable path is shipped;
   live-provider verification remains a release gate. Solver and verdict
   paths are unchanged.
3. **Physics brought to life.** Continuous bulb glow from solver power
   (P = I²R); wire current animation gated on solver current > 0,
   frozen on open switches; highlights restricted to validated solver
   IDs. Presentation only  -  no new-truth claims.
4. **Voice & visual coaching.** Transcribed Why input; coach highlights
   validated against the canvas netlist. Optional; typed input stays.

Infrastructure: Meta Model API stays primary. Open-weight hosting
(Baseten/Modal) is deferred until the browser demo is rock-solid.

## 7. Honest limits to state in the pitch

- Engineering circuits are the first live module, not the full STEM
  platform; Science, Technology, and Mathematics are future pathways.
- The orbital STEM map communicates the wider platform vision; the
  five-stop laboratory turntable lists the live tools available today.
- The trace shows what happened in one session, not learning or
  ability. One correct prediction proves nothing durable.
- Which parts are plain code (physics, verdicts, gates, templates)
  is stated openly, in the UI where it matters.
- Lesson packs ship expected values in the frontend bundle (as do
  the L1/Reality Check packs); the UI never reveals them before the attempt.
