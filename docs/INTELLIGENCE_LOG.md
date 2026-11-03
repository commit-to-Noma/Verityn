# Intelligence log

This behavior list is mirrored in `frontend/src/content/intelligence.ts`,
the Under the hood Smart details section, and the README.

- Spoken correction of a choice in Predict, Reality Check, and Solo — [spoken prediction tests](../frontend/src/voice/spokenPrediction.test.ts).
- Coach replies use the learner's own words in Coach Dock follow-up — [Meta coach tests](../backend/tests/test_meta_coach.py).
- Solver-grounded explanations with a number guard in Experiment Bay and Finale — [explanation tests](../backend/tests/test_explain.py).
- Leak guard and one validation retry for the R1 coach question — [retry trace test](../backend/tests/test_trace.py).
- Stale-state protection for cancelled or superseded Reality Lens and circuit requests — [API cancellation tests](../frontend/src/api/client.test.ts), with request-id guards in the relevant components.
- Honest `needs_review` and `unsupported` Reality Lens proposals — [vision validation tests](../backend/tests/test_vision.py).
- Server-enforced Solo with zero coach calls — [transfer tests](../backend/tests/test_transfer.py).
- Typed errors with actionable next steps — [error-safety tests](../backend/tests/test_error_safety.py).
- Prediction lock-in with a short undo window — [spoken prediction tests](../frontend/src/voice/spokenPrediction.test.ts).
- Ranked English browser voice with measured pacing — [coach voice tests](../frontend/src/voice/coachVoice.test.ts).
- Current flow and bulb glow follow solver measurements — [visual mapping tests](../frontend/src/canvas/visuals.test.ts).
- Solver readouts count up to the measured value — [readout tests](../frontend/src/components/ReadoutValue.test.ts).
- Finale circuits reveal in order with reduced motion respected — [Finale motion tests](../frontend/src/journey/finaleMotion.test.ts).
- Hub health checks retry with visible startup progress — [health status tests](../frontend/src/components/HealthStatus.test.tsx), also exercised by the browser smoke.
- Voice capture stops after silence and records per-stage timings — [voice timing tests](../frontend/src/voice/voiceTimings.test.ts).
- Finale handoff reuses the saved circuit in Experiment Bay — [Finale tests](../frontend/src/components/JourneyFinale.test.tsx) and [Experiment Bay seed tests](../frontend/src/experiment/ExperimentPage.test.tsx).
- Lens diagrams upload by drop, paste, picker, or camera — [upload tests](../frontend/src/vision/upload.test.ts).
- Traced wires overlay the uploaded photo — [review tests](../frontend/src/vision/review.test.ts) and [vision path tests](../backend/tests/test_vision.py).
- Traced wires snap onto the photo's stroke centerlines in code (polarity-blind, text-rejecting, fail-soft to the model path) — [refinement tests](../backend/tests/test_wire_refine.py).
- Confirmed Lens circuit opens in Experiment Bay — [Experiment Bay seed tests](../frontend/src/experiment/ExperimentPage.test.tsx), also exercised by the browser smoke.
- Guided verdicts compare predictions with solver readings, kindly — [verdict line tests](../frontend/src/components/PredictionVerdictLine.test.tsx).
- Batteries report supplied current and power, never negative labels — [canvas node tests](../frontend/src/components/canvas/CircuitNode.test.tsx).
- Voice transcripts are cleaned for display; raw text stays in Trace — [transcript tests](../frontend/src/voice/displayTranscript.test.ts).
- Journey progress highlights Recap on the recap page — [stage tests](../frontend/src/journey/stages.test.ts).
- Saved Reality Lens segments are tappable with SAM provenance — [sample segment tests](../frontend/src/lens/sampleSegments.test.ts).
- Shell nav holds three primary tabs (Under-the-hood lives on the Hub page only) — [shell nav tests](../frontend/src/journey/stages.test.ts), also exercised by the browser smoke.
- Guided Lab entry stays on the Hub behind a full-screen swoosh, then lands in the lab — browser smoke `lab entry swoosh` checks; `.stage-enter` uses backwards fill so retained transforms never trap fixed overlays.
- Bay run deck sits side by side (run button + status pill in one execution row) — browser smoke `execution deck side by side`.
- Fresh explosions strain first: overworked shake paints 600 ms before the blast, skipped under reduced motion — browser smoke `explosion stages a strain beat`.
- Sketch pad Insulated Trace Mode trims fresh ink within 8 px of existing ink, flashes the collision, undoes a split stroke as one batch — [stroke tests](../frontend/src/sketch/strokes.test.ts), also exercised by the browser smoke.
- Reality Check keeps the mandated neutral verdict line; the switch-practice explainer is compressed to one line — browser smoke reality-switch-practice checks.
- Run failures distinguish transport loss (auto-retry, "is the backend running?") from stale-backend contract mismatches (no retry, "restart the backend") — browser smoke stale-honesty checks; sweep stop notes match the kind.
