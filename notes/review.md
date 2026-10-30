The homepage/platform-framing pass is approved. Other planned upgrades remain
out of scope until requested.

I went through every comment against the actual code, looked at how Cerebral Valley winners present (especially Aria, OrgLens, PartyGraph), and pulled the impact numbers from published sources. I also found two real bugs your playthrough already hit: **Watch the guided demo never plays a demo**, and **your own PNG upload is easy to lose on the page**.

---

## How winners look, and what we copy

Winning hackathon UIs and READMEs do the same few things:

- The first sentence is a **human problem**, not a feature list. Aria opens with a factory operator who can hear a machine failing. We should open with **labs you cannot reach, and AI that answers so fast you stop thinking**.
- The first visual is **motion of the product**, not a paragraph.
- Layout is **wide and chrome-first**: logo, name, a few nav items, content using the screen. Verityn is currently locked to `max-w-3xl` (~768px) in `JourneyShell`, which is why the left and right feel empty.
- Upcoming work is shown as a **peek of the method**, not “coming soon”.
- Sponsor models are named **on the surface that uses them**, not only in a footer card.
- The README is a **sales page for judges**: badges, GIF, problem, architecture mermaid, named Meta models, 3-command quickstart, “built during the hackathon”.

---

## The story we will punch, with facts not jokes

Two real failures, one product:

1. **Access.** UNESCO runs remote-lab programmes because scientists in under-resourced regions, including across Africa, cannot reach equipment. UN OSAA: fewer than 25% of African higher-education students study STEM; ADEA names missing laboratories, electricity, and teachers; the World Bank estimates about 2.5 million more engineers are needed in sub-Saharan Africa.
2. **Skill rot is measurable.** PNAS 2025 (Bastani et al., ~1,000 high-school math students): an unguarded GPT tutor made practice look better, then students scored **17% worse** once the AI was removed. A hint-only tutor almost erased that harm. A 2024 *Computers in Human Behavior* study found LLM users felt less mental effort and produced **weaker scientific reasoning**.

Verityn is the guarded design that paper points at: you must predict, a **solver** owns the physics, Muse Spark may only ask and demonstrate, then Solo turns the coach off. Circuits are **Engineering, Module 1**  -  the first world we can measure in a browser  -  not the whole product.

---

## Rules so we do not break what already works

Keep: MNA solver as truth, confirm-before-simulate, closed demonstration vocabulary, Solo with coach off, schema/leak/number guards, existing tests.

Do **not**: open chat, let the model drag arbitrary parts, fake vision without Meta, ship fake Biology/Chemistry solvers, or light decorative fire that the solver did not compute.

---

## Every request, answered

**STEM hub + four labs.** Four cards are Science, Technology, Engineering, Mathematics. **Engineering is the live lab (circuits).** The other three are not grey “coming / planned”. Each is a short **interactive peek of the same method** (predict → model → evidence) so the platform looks deliberate, not unfinished. Example peeks: Science = a cell-potential storyboard you can step; Technology = sensing/vision method using Reality Lens as the proof that “seeing a system” already works; Mathematics = the live circuit’s own \(P = I^2R\) plotted so math is the language of the engine you just used.

**Lazy-susan ring.** A neuron / atom / orbit ring with four STEM “atoms” (flask, chip, gear/circuit, function). Drag or swipe; it snaps like a lazy Susan. Land on Engineering → short copy + **Start lab**. Land on the others → peek + “same method, first world is Engineering”. Reduced-motion: a static selector, no spin.

**Homepage copy.** Keep “Verityn laboratory” (you like the immersion). Replace the boring hero. Draft:

- Eyebrow: Verityn laboratory  
- Headline: **Think first. Then the universe answers.**  
- Sub: AI tutors hand out answers and the skill dies. Most of the world still cannot walk into a lab. Verityn is a STEM laboratory where **you predict, a simulator measures, and Meta AI may only ask.** Engineering circuits are live. Science, technology, and mathematics share the same loop.

Kill “Turn a static circuit diagram into…” as the mission. That sentence belongs on the Reality Lens page only.

**The four flow cards (Diagram → Meta → Editable → Solver).** They are not the app flow; they are one capability. Remove them from the hero. Put a **How you work** strip that is actually true: Lab, Experiment, Reality Lens, independently. Put Meta chips on the tools, not as a fake pipeline.

**Layout / dead space.** Raise the shell from `max-w-3xl` to a ~1280px product frame. Hero becomes two columns: story + ring. Lab canvas uses the width. Keep the glass / laboratory feel.

**Experiment tab.** First-class route next to the guided lab: empty workbench, no prediction gate, same solver. Add **two grounded parts**, not a junk drawer: (1) **wire gauge** (thin / normal) as real resistance in the netlist, which changes current and bulb brightness; (2) **battery voltage** as a real parameter. Optional resistor if it stays simple.

**Burnt / fractured / fire.** Yes, but **solver-backed**. Give the bulb a rated power. If computed \(P\) exceeds it, the solver returns `OVERLOAD` with the component id and the watts. Then the bulb visual goes intact → over-bright → filament break. The coach may only say that if those numbers exist. No speculative smoke.

**Navigation.** Persistent header: logo, Verityn, Hub, Engineering lab, Experiment, Reality Lens. In-lab: Hub / previous stage, not browser Back. Finale recommends the other three.

**Logo + tab.** `index.html` already asks for `/favicon.svg` but that file is missing (`frontend/public/icons.svg` exists instead). When you send the logo: favicon, tab title `Verityn  -  laboratory`, header mark. I will not invent a mark.

**Watch the guided demo.** Confirmed broken as a demo. It only sets `auto=true` and enters the lab. **Prediction screens never auto-answer**, so you sit on a stale page. Fix: a visible **Demo playing** mode that speaks, commits a scripted prediction, builds, demonstrates, and finishes, with Skip. Same journey, not a video file.

**What does what / where is Muse Spark, Reality Lens, Solver.** Tiny Meta chips on the live controls:

- Coach card: `Meta Muse Spark · asks, never measures`  
- Reality Lens: `Meta Muse Spark Vision · proposes; you confirm`  
- Canvas measurements: `Verityn Solver · physics`  
- Optional mic: `Voice · your words, editable`  
- SAM stays a documented spike unless we have time to overlay boxes

**Developer API benches.** Not for learners. Hide behind `?dev=1` or a presenter key. Auto-demo lives in the header as **Play demo**, in human words.

**Start with a diagram vs Snap & Build vs Experimental.** Button becomes **Reality Lens**. Drop “Experimental” and “Snap & Build” from the learner UI. One name everywhere.

**Reality Lens page is too wordy / upload is hidden.** One sentence, one drop zone on the left, samples as smaller thumbnails. Custom upload is the primary action.

**PNG picker “disappears”.** Two code facts: (1) after pick, the chooser unmounts because it only exists in `idle`; (2) the selected-image panel is **below** the sample grid, so it looks like nothing happened. Some macOS PNGs also have an empty MIME type and get rejected. Fix: keep the drop zone mounted, accept by extension if MIME is empty, show the chosen image immediately beside the drop zone, never swallow the control.

**“Vision needs a Meta API key…”.** Vision is only wired if `MODEL_API_KEY` is in the backend process. We cannot fake Meta. We can make it **feel finished**: curated samples always work; custom upload is enabled when vision is healthy; if the key is missing, a short **Connect Meta Model API** card with retry  -  not “the rest of Verityn works without it”. I will also check `.env` is actually loaded when we implement, because that is the usual cause.

**Left photo, right interactive, overlay so it did not hallucinate.** This is already the intended Reality Lens design (`compare` / original / detected / model). We make **compare the default**, keep overlays tied to proposal regions, and keep Confirm before the solver. Non-circuit images return `unsupported` in plain language: “This does not look like a circuit. Try a schematic or a photo of a battery–bulb–switch loop.”

**“Contradicted by the model”.** Replace learner-facing labels:

- Consistent → **Matches what the simulator measured**  
- Contradicted → **Does not match the measurement**  
- Can’t assess → **Nothing to compare yet** (and only when that is true; if they built the expected circuit, never show this as a product failure)

**AI controls the diagram, automatically, not via extra buttons.** Keep the closed list (`open_switch`, `close_switch`, `highlight_path`). After the coach speaks, **auto-play the validated action** (with a short “Watch” beat and Undo). Do not let the model drag batteries around. That would break the judging story.

**Voice as conversation.** Today it is browser TTS + a mic that fills the Why box, optional, easy to miss. Plan: coach lines **speak themselves**; you can **answer by voice**; Why is quoted back; typed input always works. Still a **turn-taking lab**, not ChatGPT. If Muse Voice Transcribe is available with the same key, use it for the transcript; otherwise keep browser speech and label it honestly.

**Solo second bulb / overlapping wires.** Transfer seed places L2 off to the side with a hanging wire over the loop. Relayout to a clean schematic: existing loop as a rectangle, second bulb clearly parallel, **orthogonal (`smoothstep`) wires**, terminals that do not cross bodies. Same physics, readable picture.

**Finale is a dead end / “what you predicted” is CS-speak.** Rewrite as a learner recap: what you thought, what you built, what the simulator measured, what you did alone. Then **where next**: Experiment, Reality Lens, Hub ring. Keep Evidence Trace collapsed for humans, open for judges.

**README (cosmetic, vision-first).** Rebuild as a winner README without changing product truth:

1. Title + punchy one-liner  
2. Badges (Meta Muse Spark, SAM 3.1, React, Python) + track: Push the Frontier · Indie · Solo  
3. Hero GIF/screenshot  
4. Problem (Africa lab access + PNAS 17% with links)  
5. What Verityn does  
6. Mermaid: learner → Spark (propose/ask/demonstrate) → code guards → solver (truth)  
7. Meta models table (Spark, Vision, Voice, SAM spike, Muse Code)  
8. Demo story (3 minutes)  
9. Quickstart  
10. What was built during this hackathon  
11. Acknowledgements  

**Pitch deck.** After the app freeze, a short deck that maps 1:1 onto the rubric: problem, why Push the Frontier (physical system + verifiable agent), architecture, Meta usage, 3-minute demo beats, impact, ask. Not before the product looks like the slides.

---

## My additions (on top of yours)

- Persistent laboratory chrome so Meta / Solver / Lens are always one click away.  
- Auto-demo that actually **performs** the journey (this is the film backup).  
- Coach quotes the Why line, including nonsense, then points at the circuit.  
- Overload and wire gauge as **solver features**, so the “burnt bulb” is a measurement, not a cartoon.  
- Orthogonal wires everywhere, not only Solo.  
- `?dev=1` for benches so the learner path stays clean.  
- Health that distinguishes “simulator ready” vs “Meta vision ready”.  
- README architecture mermaid so judges see the neuro-symbolic split in ten seconds.

---

## Build order (nothing outranks a filmable demo)

1. Chrome, width, copy, STEM ring, nav, favicon/title.  
2. Reality Lens naming, upload bug, overlay default, vision health.  
3. Guided demo that actually plays; hide benches.  
4. Wires, Solo layout, verdict English, auto-demonstrate, voice turns.  
5. Experiment tab + rated-power overload.  
6. Finale + hub recommendations.  
7. README cosmetics.  
8. Your playtest bugs, then my live browser pass, then pitch deck.

---

## Current approved scope

The user supplied the logo, confirmed Engineering circuits as the first live
module, approved solver-rated-power overload behavior, and authorized the
homepage/platform-framing pass. This pass is limited to the STEM orbit, the
existing feature turntable's concise visual panels, the full-width sticky
header, and related product documentation. The other upgrades in this plan
remain separate work until requested.

## Confirmed homepage direction

- Verityn is a STEM learning platform, not a circuits-only product. Science,
  Technology, Engineering, and Mathematics are the four visible disciplines.
- Engineering circuits are the first live module; the other subject labs must
  be identified as future pathways rather than implied to be complete.
- Keep the existing five-stop feature turntable and its side arrows:
  Guided Lab, Experiment Bay, Reality Lens, Meta Muse Spark, and Verityn Solver.
  Add concise copy and a small relevant illustration to the selected panel.
- Show the four STEM disciplines as a separate orbital map, so the broader
  platform vision and today's five live tools are both easy to understand.
- Remove the redundant hero `Enter Guided Lab` and `Explore the Laboratory`
  buttons; keep the guided-demo entry and route to current features from the
  feature turntable and the Engineering orbit selection.
- Make the sticky header full viewport width while keeping its content aligned
  with the main product frame.