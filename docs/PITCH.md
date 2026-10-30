# Verityn  -  Pitch Deck (slide script + speaker notes)

Submission: Meta Global AI Developer Hackathon. Circuits are the first
complete laboratory; the method  -  predict, test against evidence,
transfer solo  -  is the product.

Timing: ~3 minutes spoken + the recorded demo. Every claim below is
true of the committed tree; nothing is mocked for the pitch.

---

## Slide 1  -  Title (0:00–0:15)

**Verityn  -  Turn questions into experiments.**

> As a student, I see how easy it is to ask AI for an answer and move
> on. But getting the answer doesn't mean you can solve the next
> problem yourself. Verityn is an AI-guided lab where you think first,
> test your idea against measured evidence, and then prove it without AI.

## Slide 2  -  The problem (0:15–0:40)

**Answers feel like learning. They aren't.**

- AI tutors improve practice performance, yet students using the
  less-restricted version can perform worse once AI is removed
  (2025 PNAS Nexus study on AI tutors in high-school maths).
- Verityn does not claim to cure this from one task. It demonstrates
  a think-first method through an objectively testable activity.

## Slide 3  -  The loop (0:40–1:10)

Verityn is an AI-guided STEM laboratory. The homepage lets judges
explore the laboratory stations; the guided circuit journey
demonstrates the complete prediction-to-evidence loop.

**Predict → Build → Simulate → Explain → Try solo.**

1. The learner commits to a prediction before any help unlocks.
2. They build the circuit on an interactive canvas.
3. Our deterministic MNA solver  -  never the model  -  computes the result.
4. Muse Spark asks a Socratic question grounded in those numbers.
5. A fresh circuit must be solved with the coach fully off.

## Slide 4  -  Division of responsibilities (1:10–1:40)

| Role | Owner | Evidence |
|---|---|---|
| Physics truth | Verityn Solver (MNA) | current, power, validity, verdict |
| Diagram reading | Muse Spark Vision | proposed components + provenance |
| Coaching | Muse Spark | one grounded question at a time |
| Demonstration | App-validated actions | preview → apply → re-solve → undo |

Model output is always a proposal: schema checks, leak checks, and
numbers allowed only from solver facts. The learner confirms every
model proposal before it touches the simulator.

## Slide 5  -  Live demo (1:40–2:40)

Play the 60–90 second recording (see `docs/DEMO_SCRIPT.md`):
the guided demo performs the real journey in ~40 seconds  -  open-gap
repair at 0.6 A / 3.6 W, the open-switch contradiction at 0.0 A,
the coach question, the validated S1 demonstration, and the solo
second-bulb proof with zero coach calls.

## Slide 6  -  What the evidence shows (2:40–2:55)

The finale reports observed session facts, never a score:

- You recorded a prediction before opening the coach.
- You used the R1 → R2 → R4 ladder on the contradiction.
- You completed the new circuit with AI assistance disabled.

No mastery score, no dependency score  -  what happened, honestly stated.

## Slide 7  -  Honest scope + close (2:55–3:10)

Working now: guided circuit lab (Engineering Module 1), Reality Lens
review flow, free Experiment Bay with solver-measured overload
physics, optional voice, 564 + 337 tests, full browser smoke. Planned,
not claimed: full Science, Technology, and Mathematics subject labs,
plus engineering systems beyond circuits.

> Verityn: the AI asks the question, the simulator supplies the
> evidence, and the learner makes the meaning.

---

## Appendix  -  backup answers

- **Why not just a chatbot tutor?** No open chat exists; help is
  graduated and gated behind the learner's own prediction and build.
- **What if Meta is down?** Every model call has a labeled
  deterministic fallback; the demo never fails and never lies
  about which provider served.
- **Is the physics real?** A simplified classroom MNA model  - 
  honest about being idealised, exact about every number shown.
- **Overload?** Rated bulbs (6 V / 6 W): 12 V measures 1.2 A /
  14.4 W overloaded, then latches damaged at 0.0 A. A solver
  measurement, not an animation.
