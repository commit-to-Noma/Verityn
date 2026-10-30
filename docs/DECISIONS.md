# Verityn: locked direction

The complete implementation and release checklist is in
[PRODUCT_PLAN.md](./PRODUCT_PLAN.md).

Settled decisions. Implementation takes priority over reopening
these unless the official rules or a real technical blocker forces
a change.

## Impact story

AI can make getting an answer feel like learning. Verityn helps
you practise doing the thinking yourself.

## Fixed loop

Think first (prediction gate, no prediction no answer) → Build →
Reflect (simulator owns the result, plain language, no grading of
the person) → Try solo (fresh AI-off challenge, factual recap).
One demonstrated no-AI completion is shown; it is not claimed to
prove lasting learning or cure skill rot.

## Meta AI role

Muse Spark is the structured interpreter and Socratic coach;
deterministic simulation is the source of truth. Claim extraction
and unrestricted tool calling remain deferred, but a small closed vocabulary
of validated demonstration actions is shipped. Voice is optional. Reality Lens
uses a reviewable vision proposal with component/connection evidence,
provenance, and polarity where known. The learner confirms it before any
canvas or solver handoff. A verified offline fixture keeps the path demoable;
live provider verification is a separate authorized release gate. No model may
invent measurements, verdicts, or topology certainty.

## Language

Kept as shipped and verified: "Consistent with the model",
"Contradicted by the model", "Can't assess". No mastery, learning,
or dependency scores  -  show the actual actions. Judging-weight
percentages from early planning are unconfirmed; never cite them.

## Acceptance gates

Official rules and access confirmed; complete loop works; Meta AI
role visible and essential; no invented feedback; impact honestly
stated; resilient demo (no login, reset, typed input, fallback,
smoke test); submission ready early with backup recording.

## Additional locked decisions

- Reality Check is the learner-facing name for the contradiction/evidence stage;
  legacy lesson and server identifiers may remain unchanged for compatibility.
- A model-requested demonstration is previewed, validated by application code,
  applied only to the confirmed circuit, and recorded in the Evidence Trace.
- Vision output is never presented as calibrated confidence. Missing or
  conflicting evidence becomes needs_review or unsupported.
- Solo must make zero coach requests across manual, replay, and Auto-demo paths.
- Live diagnostics use one request per attempt and no retries; transport, HTTP,
  parse, and validation failures are reported as different categories.
