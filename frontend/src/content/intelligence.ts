export const META_EVIDENCE_BASE =
  'https://github.com/commit-to-Noma/Verityn/blob/main/'

export const SMART_DETAILS = [
  {
    behavior: 'Spoken correction of a choice',
    where: 'Predict, Reality Check, and Solo',
    evidence: 'frontend/src/voice/spokenPrediction.test.ts',
  },
  {
    behavior: "Coach replies use the learner's own words",
    where: 'Coach Dock follow-up',
    evidence: 'backend/tests/test_meta_coach.py',
  },
  {
    behavior: 'Solver-grounded explanations with a number guard',
    where: 'Experiment Bay and Finale',
    evidence: 'backend/tests/test_explain.py',
  },
  {
    behavior: 'Leak guard and one validation retry',
    where: 'R1 coach question',
    evidence: 'backend/tests/test_trace.py',
  },
  {
    behavior: 'Stale-state protection for cancelled or superseded requests',
    where: 'Reality Lens and circuit runs',
    evidence: 'frontend/src/api/client.test.ts',
  },
  {
    behavior: 'Honest needs_review and unsupported Reality Lens proposals',
    where: 'Reality Lens review',
    evidence: 'backend/tests/test_vision.py',
  },
  {
    behavior: 'Server-enforced Solo with zero coach calls',
    where: 'Solo second-bulb challenge',
    evidence: 'backend/tests/test_transfer.py',
  },
  {
    behavior: 'Typed errors with actionable next steps',
    where: 'API responses and learner notices',
    evidence: 'backend/tests/test_error_safety.py',
  },
  {
    behavior: 'Prediction lock-in with a short undo window',
    where: 'Voice replies in every stage',
    evidence: 'frontend/src/voice/spokenPrediction.test.ts',
  },
  {
    behavior: 'Ranked English browser voice with measured pacing',
    where: 'Coach Dock playback',
    evidence: 'frontend/src/voice/coachVoice.test.ts',
  },
  {
    behavior: 'Current flow and bulb glow follow solver measurements',
    where: 'Circuit test result',
    evidence: 'frontend/src/canvas/visuals.test.ts',
  },
  {
    behavior: 'Solver readouts count up to the measured value',
    where: 'Guided result card and circuit readouts',
    evidence: 'frontend/src/components/ReadoutValue.test.ts',
  },
  {
    behavior: 'Finale circuits reveal in order with reduced motion respected',
    where: 'Finale timeline',
    evidence: 'frontend/src/journey/finaleMotion.test.ts',
  },
  {
    behavior: 'Hub health checks retry with visible startup progress',
    where: 'Hub on first load',
    evidence: 'frontend/src/components/HealthStatus.test.tsx',
  },
  {
    behavior: 'Voice capture stops after silence and records stage timings',
    where: 'Trace drawer voice captures',
    evidence: 'frontend/src/components/TracePanel.test.tsx',
  },
  {
    behavior: 'Finale handoff reuses the saved circuit in Experiment Bay',
    where: 'Journey Finale experiment action',
    evidence: 'frontend/src/components/JourneyFinale.test.tsx',
  },
  {
    behavior: 'Lens diagrams upload by drop, paste, picker, or camera',
    where: 'Reality Lens drop zone',
    evidence: 'frontend/src/vision/upload.test.ts',
  },
  {
    behavior: 'Traced wires overlay the uploaded photo',
    where: 'Lens review original',
    evidence: 'frontend/src/vision/review.test.ts',
  },
  {
    behavior: 'Traced wires snap onto the photo strokes in code',
    where: 'Lens review original',
    evidence: 'backend/tests/test_wire_refine.py',
  },
  {
    behavior: 'Confirmed Lens circuit opens in Experiment Bay',
    where: 'Lens review handoff action',
    evidence: 'frontend/src/experiment/ExperimentPage.test.tsx',
  },
] as const
