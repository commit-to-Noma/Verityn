# Verityn: Architecture (draft, planning only)

Concept: **a coach that steps back.** The learner thinks first, gets graduated help that ends with the AI completing their drawing as a last resort, then solves a new challenge with the AI switched off.
Status: written before the Official Rules are read. No application code until they are. Items marked **VERIFY** are checked on Oct 26.
This replaces v2 (the "teach the AI" protege design is dropped).

## 1. Principles
1. **Code owns facts and progression.** Physics, verdicts, which rung of help comes next, and whether the AI is allowed to speak are all decided by code.
2. **Meta models own interpretation and language.** They do the things code cannot: read messy human input (speech, sketches), diagnose why the learner went wrong, and phrase help naturally.
3. **Every model output is a proposal.** It is schema-checked and validated before it reaches the learner.
4. **No decorative AI.** Every Meta call must change what the app does. We never call a model for show, and the docs state which parts are plain code.
5. **No invented claims.** No growth scores, no "proof of learning", no emotion detection.

## 2. The event loop
```
learner action (stroke / speech / typed / idle)
   |
   v
 INPUT          strokes.py recognizes symbols (fast path, plain code)
                messy or unclear shape -> Spark vision proposes a netlist (slow path)
                speech -> Voice Transcribe (realtime) -> text
   |
   v
 CHECK (code)   validator -> solver -> evaluator   (facts + error codes + component ids)
   |
   v
 LADDER (code)  decides the rung from attempts, idle time, explicit "help"
   |
   v
 BRAIN (Spark)  diagnose why the learner went wrong; phrase the help for that rung
   |
   v
 GUARDS (code)  closed-list diagnosis, no-answer-leak check, numbers only from code
   |
   v
 UI             spoken + written reply; animated pointing at the exact component ids
```

## 3. The help ladder (state machine)
| Rung | What the learner gets | Unlocked by |
|---|---|---|
| R0 Predict | Nothing yet. "What do you think will happen?" | Start (locked until a prediction is recorded) |
| R1 Question | A guiding question aimed at the diagnosed misconception | Wrong or incomplete attempt |
| R2 Point | Animated highlight of the exact parts (ids come from the validator) plus a question | Another failed attempt, or idle time |
| R3 Hint | A concrete hint, still without the answer | Another failed attempt, or an explicit request |
| R4 Complete | The AI finishes the drawing; the learner watches; code builds the fix and the solver verifies it | R3 used and still stuck |
| Reflect | "What was the problem? How did we fix it?" The reply is checked | After success at any rung |
| Solo | A fresh challenge; the server refuses every Meta API call | After Reflect |
| Recap | Facts only: prediction first, rung reached, solo result | After Solo |

Rules: the server rejects skipped rungs; the model cannot raise or lower a rung; the rung reached is shown honestly in the recap.
"Stuck" signals are behavioural only: failed attempts, idle time, repeated errors, and phrases like "I don't get it". Meta's voice model does not detect emotion, so we do not claim it.

## 4. Jobs only the models can do
| Job | Model | Input | Output (validated) |
|---|---|---|---|
| Diagnose why the learner went wrong | Spark 1.3, structured output | Prediction text/transcript, stroke summary, solver error code, lesson context | `{misconception_id from a closed list or "unclear", evidence_quote, focus from a closed list}` |
| Phrase the help for the rung | Spark | Diagnosis, rung, facts object from code, recent attempts | One short reply; guards reject answer leaks and numbers not in the facts object |
| Read an unclear sketch (slow path) | Spark vision | Rendered canvas image | Netlist proposal; learner confirms; validator checks |
| Understand the learner's explanation in Reflect | Spark | Transcript | Closed-schema claim; evaluator checks it |
| Hear the learner, live | Voice Transcribe (realtime WebSocket, keyword biasing) | PCM audio via server proxy | Transcript |

Not in the core: SAM 3.1 (strokes need no image segmentation; it stays a stretch for photographing paper), Muse Wonder second opinion (optional if time remains), Muse Image (decorative).

## 5. Fast path versus slow path (sketching)
- Fast path: the learner draws on the iPad; `strokes.py` recognizes a small symbol set in plain code. This keeps the UI instant.
- Slow path: only when the fast path rejects a shape, the rendered canvas goes to Spark vision.
- We report how often the slow path rescues a sketch the fast path missed. If it never helps, we say so and drop it.

## 6. Deterministic completion (R4)
- `complete.py` computes the smallest fix from the validator's error code and component ids (for example, connect two loose ends with a wire).
- The solver verifies the completed circuit before it is shown.
- Spark narrates; code decides what gets drawn.

## 7. Modules (`src/verityn/`)
| File | Purpose |
|---|---|
| `solver.py`, `evaluator.py` | Truth and verdicts (contracts defined by the existing tests) |
| `ladder.py` | State machine, rung rules, stuck signals |
| `strokes.py` | Fast-path symbol recognizer |
| `diagnose.py` | Spark diagnosis call and closed-list validation |
| `hints.py` | Spark phrasing call, leak check, facts-only numbers, template fallbacks |
| `complete.py` | Deterministic fix for R4 |
| `sketch_vision.py` | Slow path (gated) |
| `voice_proxy.py` | Flask WebSocket proxy; key stays server-side |
| `misconceptions.py` | Documented misconceptions: ids, diagnostic patterns, per-rung template lines |
| `lessons/*.json` | Lesson packs: challenge circuit, expected misconceptions, solo circuit |
| `recap.py` | Factual session summary |
| `api.py` | Flask routes, serves the built React app |

## 8. Honest limits to state in the pitch
- Circuits are the demonstration domain; the pattern (predict, help ladder, solo) is the idea.
- The AI speaks through the browser's built-in voice (Meta's voice model only listens). Voices vary by device; text is always shown.
- No claim that one session proves learning; the recap shows what happened.
- Which parts are plain code (physics, recognition fast path, completion) is stated openly.

## 9. Failure ladder
1. All models up: full experience.
2. Slow path down: fast path only; unclear shapes fall back to the palette canvas.
3. Voice down: typed input.
4. Spark down or credits gone: pre-written per-misconception, per-rung template hints; solver, ladder and completion unaffected.
5. All AI off: the whole loop still runs, with template hints.
Must pass step 5 on the deployed app on Nov 3.

## 10. What we report (real numbers with sample sizes)
Diagnosis accuracy on labelled wrong predictions; leak rate across hint tests; fast versus slow path rescue rate; voice accuracy with and without keyword biasing; latency per rung.

## 11. Data, privacy, hosting
No accounts, no personal data stored in (**VERIFY** the final build). Audio is streamed and not saved. Standard-mode model IDs only. The API key stays on the server. One always-on Flask host with WebSocket support (**VERIFY**), HTTPS for microphone and iPad.

## 12. Build order and cuts
| Date | Focus |
|---|---|
| Oct 26 | Rules, API and credits check, scaffold |
| Oct 27 | Solver tests passing; spikes: voice, stroke recognizer, Spark diagnosis, Spark vision |
| Oct 28 | Canvas, strokes, validator wiring, ladder |
| Oct 29 | Diagnosis, hints, guards, first full loop |
| Oct 30 | Pointing animations, completion, reflect |
| Oct 31 | Benchmarks; keep or cut gated parts; solo challenge |
| Nov 1 | End-to-end; voice decision final |
| Nov 2 | Polish, deploy, failure injection |
| Nov 3 | Smoke test on the deployed URL; backup video; freeze |
| Nov 4 | Submit with a buffer before 9:00 PM ET |

Cut order: slow-path vision, then realtime voice (typed stays), then extra lessons, then polish. Never cut: solver, validator, ladder, diagnosis plus guards, solo, failure ladder.

## 13. VERIFY on Oct 26
Pre-event coding rules; AI-assisted code rules; credit expiry versus the judging window; South Africa availability; tool-calling and image-input syntax; WebSocket host support; iPad Safari audio and stroke input; browser voices on the iPad.
