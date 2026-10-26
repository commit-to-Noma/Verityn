# Verityn: Test Plan (draft)

Matches `ARCHITECTURE.md` (the coach that steps back). Planning only; no code until the Official Rules are read.
Principles: deterministic code is tested with exact expectations; model behaviour is *measured* and reported with sample sizes, never assumed; thresholds below are **starting points**, written down before we see results. If we change one, we record why.

## 1. Already built (done)
| File | Covers |
|---|---|
| `fixtures/valid_circuits.json` | 20 hand-solved circuits, laws verified exactly |
| `fixtures/invalid_circuits.json` | 15 rejected circuits, 9 error codes, detection order |
| `fixtures/prediction_cases.json` | 40 claims; labels derived from hand-solved values |
| `test_solver.py`, `test_invalid_circuits.py`, `test_prediction_evaluator.py`, `test_integrity.py` | Solver, rejection, evaluator, no-mutation (skip until `src/verityn/` exists; CI sets `VERITYN_REQUIRE_IMPL=1`) |

## 2. New test files, in build order
| # | File | Needs AI? | Proves |
|---|---|---|---|
| 1 | `test_ladder.py` | No | The help ladder obeys its rules |
| 2 | `test_hint_guards.py` | No | Unsafe model output never reaches the learner |
| 3 | `test_complete.py` | No | R4 completion is correct, minimal, and refuses to guess |
| 4 | `test_strokes.py` | No | Fast-path symbol recognition: correct, or reject, rarely wrong |
| 5 | `test_failure_ladder.py` | Fake client | The app survives every AI failure mode |
| 6 | `bench_diagnosis.py` | Live (marked `live`) | Spark's misconception diagnosis accuracy |
| 7 | `bench_sketch_vision.py` | Live | Slow-path sketch reading accuracy |
| 8 | `bench_voice.py` | Live | Transcription accuracy with and without keyword biasing |
| 9 | `e2e/journey.spec.ts` (Playwright) | Both modes | Whole journey on the deployed URL |

Live benchmarks are excluded from the default run; their raw model outputs are cached so regression runs are deterministic.

## 3. Deterministic tests (build first)

### 3.1 `test_ladder.py`
- No help, hint or answer before a prediction is recorded (R0 locked).
- Rungs advance in order only: R1 Question, R2 Point, R3 Hint, R4 Complete. Skipping is rejected.
- Advance triggers: failed attempt, idle time (injected clock), explicit "help". Nothing else.
- Model output can never raise or lower a rung (fields in model JSON are ignored).
- R4 only after R3 has been used.
- Solo: a spy client records **zero** Meta API calls, and every attempted call is refused.
- Recap contains only facts (prediction first, rung reached, solo result). No `score`, `grade` or `proof` keys; a test greps the recap output.
- The rung shown in the recap equals the rung actually reached.

### 3.2 `test_hint_guards.py`
- Diagnosis must be a known `misconception_id` or `"unclear"`. Unknown id becomes `"unclear"`.
- Malformed JSON, missing fields and extra fields are rejected.
- A hint containing a number not in the facts object is rejected.
- A hint that states the lesson's answer is rejected (two layers: per-lesson forbidden phrases, then the claim extractor run on the hint).
- R1 hints must be questions; length limits enforced.
- A rejected hint is replaced by the per-rung template; the rejected text is never shown.
- **Adversarial set:** 20 hand-written paraphrases that leak the answer. Starting threshold: at least 90% caught. We report the actual rate and which ones slipped through.

### 3.3 `test_complete.py` (new fixture `completions.json`, built from the invalid fixtures and hand-solved)
| Source | Expected |
|---|---|
| I03 battery + bulb, return missing | Add a wire; bulb 0.6 A, 3.6 W |
| I04 half-wired parallel branch | Add a wire; both bulbs 0.6 A |
| I05 wire to nowhere | Remove the stub wire; bulb 0.6 A |
| I08 wire across battery with bulb | Remove the shorting wire; bulb 0.6 A |
| I01, I02, I06, I07, I09 to I15 | **Return nothing** (ambiguous, intent unknown, or the repair leaves a useless circuit, such as a lone battery); never guess |

- Every completion passes the validator and the solver, adds or removes the minimum parts, and expected values come from hand solutions.

### 3.4 `test_strokes.py` (new fixture set `strokes/`)
- Synthetic strokes for each symbol (battery, bulb, resistor, switch, wire): 20 clean, 40 messy (seeded jitter, rotation, gaps), plus 15 real iPad strokes you record.
- Outcomes are *correct*, *rejected* (asks the learner to redraw or sends to the slow path), or *wrong*. Starting thresholds: clean at least 95% correct; messy at least 80% correct; wrong at most 3%. Rejecting is always preferred to guessing.

### 3.5 `test_failure_ladder.py` (fake Meta client with failure modes)
Timeout, HTTP 500, malformed JSON, schema-invalid JSON, credits exhausted, WebSocket drop.
- The loop continues with template hints; no stack trace or raw model text reaches the user.
- With all AI off, the whole journey, including Solo, still completes.

## 4. Live benchmarks (after the window opens; mind credits)

### 4.1 Diagnosis (`bench_diagnosis.py`)
- Set A (by construction): wrong predictions generated from each misconception rule plus an "unclear" group, in clean and messy phrasing, about 60 cases.
- Set B (human): 25 to 30 messy wrong-prediction sentences **you write**, with your own labels. This is the test of whether it matches real learners; our clean sentences cannot show that.
- Metrics: accuracy; "unclear" rate; **wrong-but-confident rate** (the costly error). Starting threshold: wrong-but-confident at most 10% on Set B. Report both sets separately.
- Also report per-effort-level accuracy and latency.

### 4.2 Sketch vision (`bench_sketch_vision.py`)
- 30 iPad sketches: 10 clean, 10 messy, 10 incomplete or ambiguous, with hand-labelled netlists.
- Metrics: exact netlist match; asked-for-clarification rate; **invented-circuit rate** (confident but wrong); fast-path versus slow-path rescue rate.
- Starting thresholds: invented at most 5%; at least 80% usable after two learner corrections. If the slow path rescues nothing, we say so and drop it.

### 4.3 Voice (`bench_voice.py`)
- 30 spoken predictions on the iPad (scripted, with natural slips), expected transcripts and claims.
- Metrics: word accuracy with and without keyword biasing; claim accuracy after transcription (starting threshold at least 90%); time to first partial transcript.
- Manual gate: iPad Safari microphone and audio format work. If not, typed input only.

## 5. End-to-end (`e2e/journey.spec.ts`, on the deployed URL)
Run twice: AI on, then AI off. Fresh browser context, iPad-sized viewport.
- No login; "load example" and "reset" work.
- Think-first gate: no hint appears before a prediction.
- A deliberate mistake triggers a pointing animation on the **correct component id**.
- R4 completion draws and the solver result matches the expected value.
- Solo: the network log shows zero AI requests.
- Recap shows only facts.
- The deployed host does not sleep; cold start is acceptable.

## 6. Not unit-testable: rehearsal checklist (visual payoff)
Run three times on the iPad and time it: prediction, build, point, completion, glow, current flow and recap feel like one continuous experience; the demo fits the time limit; nothing needs explaining. Record what felt wrong each time.

## 7. Data you collect (about three hours, own data only)
30 iPad sketches (10 clean, 10 messy, 10 incomplete or ambiguous), 30 spoken predictions, 25 to 30 messy wrong-prediction sentences with labels, 15 real stroke samples. Check the rules first for anything restricted before the event.

## 8. Day 2 gates (Oct 27)
| Spike | Keep if | If it fails |
|---|---|---|
| Voice | iPad audio works; claim accuracy at least 90% | Typed input |
| Strokes | Thresholds in 3.4 | Palette canvas |
| Diagnosis | Wrong-but-confident at most 10% | Diagnosis limited to "unclear" plus template questions |
| Vision (slow path) | Invented at most 5% | Cut; fast path and palette only |

## 9. What we report (README results table)
Metric, sample size, result, limits. Examples: diagnosis accuracy (Set A, Set B), wrong-but-confident rate, hint leak catch rate, stroke recognition, vision invented rate, voice accuracy with and without biasing, latency per rung. Say "n = 30" next to every number. No claim about learning outcomes.

## 10. CI
`VERITYN_REQUIRE_IMPL=1`; default run excludes `live`; fixtures rebuilt by `scripts/build_fixtures.py`; the build fails if any hand solution breaks a circuit law.
