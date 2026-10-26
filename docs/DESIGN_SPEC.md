# Verityn: UI build spec (draft)

Scope: three screens. Circuit workspace is the visual centrepiece. No 3D, no extra screens.
Tokens: `tokens.css` (CSS variables mapped into Tailwind 4). No raw hex in components.

## 1. Principles
- The canvas gets the most space and the least decoration.
- Colour has one job each: cyan = current/primary action, amber = light, violet = AI coach, green/coral/grey = verdicts.
- Verdicts always carry an icon and a word. Colour is never the only signal.
- Numbers (amps, volts, watts) are always monospace.
- Honest wording: "Consistent with the model", "Contradicted by the model", "Can't assess". Never "wrong" or "you have a misconception".

## 2. Tokens in use (see tokens.css)
| Tailwind class | Role |
|---|---|
| `bg-canvas`, `bg-canvas-2` | Page gradient |
| `glass` (class), `bg-glass-strong` | Panels; hover/selected |
| `border-glass-border`, `border-glass-border-strong` | Panel and control borders |
| `text-ink`, `text-ink-muted` | Main / secondary text |
| `text-flow`, `bg-flow` | Current, wires, primary buttons |
| `text-light`, `bg-light` | Bulbs, lit state |
| `text-coach`, `bg-coach` | AI coach identity only |
| `text-ok`, `text-bad`, `text-unknown` (+ `-tint` fills) | Verdicts |
| `text-on-accent` | Text on filled cyan/amber/violet buttons |

Contrast (computed): all text colours pass 4.5:1 on canvas and glass. Exception found: violet and coral text on a 14% tinted chip at the lighter gradient end falls to 4.3 to 4.5.
Rule: chip labels use `text-ink`; the verdict colour appears on the icon and border only.

## 3. Type
| Use | Size | Weight | Font |
|---|---|---|---|
| Screen title | 28px (`text-xl`) | 600 | UI |
| Panel title | 20px (`text-lg`) | 600 | UI |
| Body | 16px | 400 | UI |
| Labels, helper | 14px (`text-sm`) | 500 | UI |
| Captions | 12px (`text-xs`) | 500 | UI |
| Readouts (0.12 A) | 16 to 28px | 500 | Mono |

Fonts: Space Grotesk and JetBrains Mono, installed via npm (`@fontsource-variable/space-grotesk`, `@fontsource-variable/jetbrains-mono`; confirm package names at install). System fallbacks are in the stack, so the app still works if they fail. Line height 1.5 body, 1.2 titles.

## 4. Spacing, borders, glow
- 4px base. Allowed steps: 4, 8, 12, 16, 24, 32. Panel padding 16 (compact) or 24. Gap between panels 16.
- Radius: panels 16, controls 10, chips full.
- Borders: 1px `glass-border`; selected or focused: `glass-border-strong`; focus ring 2px white, 2px offset.
- Blur: 16px on panels only. Never blur the circuit canvas itself.
- **Glow limits:** only three tokens exist (`glow-flow`, `glow-light`, `glow-coach`).
  - Flow glow: current particles only.
  - Light glow: lit bulbs only.
  - Coach glow: the newest coach message only.
  - Maximum one coach glow on screen. No glow on buttons, cards or text.

## 5. Layout and responsive
Top bar (56px): logo "Verityn", three-step nav (Learn, Predict & Build, Evidence), step indicator.

| Width | Behaviour |
|---|---|
| >= 1180 (laptop, iPad landscape) | Full layout as below |
| 768 to 1179 (iPad portrait) | Side panels become collapsible drawers; canvas is full width |
| < 768 | Learn and Evidence readable; Predict & Build shows "Open on a tablet or laptop to build circuits" |

Targets: 1440x900 laptop and 1180x820 iPad landscape must fit without page scroll on Predict & Build. No horizontal page scroll at any width. Touch targets at least 44px (`.tap`).

## 6. Screens

### 6.1 Learn
Layout: lesson panel (left, ~60%) + coach panel (right, ~40%).
- Lesson panel: concept title, short explanation, one static labelled circuit diagram, "What to notice" list.
- Coach panel (violet identity): chat with suggested questions. Coach gives hints, not answers. Hint ladder: nudge, then clue, then worked reasoning. Show a small "Hint 1 of 3" label.
- Footer button (cyan, primary): "Make a prediction".
- States: empty (suggested questions), coach thinking (3-dot pulse), coach error ("Coach unavailable. You can continue without it."), offline.

### 6.2 Predict & Build (the centrepiece)
Layout: top prediction bar, left palette rail (72px), canvas (fills the rest), bottom run bar.
- **Prediction bar:** closed-choice claims first (chips such as "Both bulbs equally bright", "Bulb A brighter", "Bulb B brighter", "Neither lights"), optional one-line free text, optional mic button (stretch; hidden if unavailable). Prediction locks when the user presses Build.
- **Palette rail:** Battery, Bulb, Switch, Wire tool, Delete. Place by tap-to-select then tap-canvas (works on touch); drag also works on mouse.
- **Canvas (React Flow):** dot grid at 6% white, nodes snap to 20px grid, wires cyan 2px. Selected node gets `glass-border-strong`. Node connection handles at least 24px hit area.
- **Run bar:** "Run simulation" (cyan primary), Undo, Clear, Switch state toggles on nodes. Run disabled with reason text until the circuit is valid.
- States: empty canvas (hint text "Place a battery to begin"), building, **invalid** (inline banner naming the problem: open circuit, shorted battery, floating part, with the offending parts outlined coral), simulating, lit result (bulbs glow amber; cyan particles flow, speed scaled to current and capped).
- Apple Pencil/freehand.

### 6.3 Evidence
Layout: left = replayed circuit (read-only, with current labels); right = verdict list; bottom = explanation + transfer card.
- **Prediction card:** shows what the student said, verbatim.
- **Verdict list:** one row per claim: icon, label, claim text. Consistent (check icon), Contradicted (x icon), Can't assess (question icon). Below each: the numbers that decided it (mono, e.g. `Bulb A 0.10 A, Bulb B 0.10 A`).
- **Measurements table:** per component voltage, current, power. Mono, right-aligned.
- **Explanation (violet):** short, written only from the solver numbers; tagged "Coach explanation". Footnote: "This tests your prediction against the model, not you."
- **Transfer card:** a new circuit question with the coach visibly off ("Coach off" badge). Student predicts again; result appears in the same verdict format.
- Buttons: "Try another circuit" (secondary), "Back to Learn" (ghost).

## 7. Components
| Component | Variants | Notes |
|---|---|---|
| `GlassPanel` | default, strong | Wraps `.glass`, padding prop |
| `Button` | primary (cyan fill, `text-on-accent`), secondary (glass + border), ghost, coach (violet fill) | All have `.tap` |
| `ClaimChip` | selectable, selected | Selected: `border-flow`, check icon |
| `VerdictChip` | ok, bad, unknown | Icon + text label (`text-ink`); colour on icon and border |
| `CoachMessage` | user, coach, error | Coach has violet avatar and (newest only) glow |
| `ReadoutValue` | with unit | Mono, tabular numbers |
| `StatusBanner` | info, invalid, error | Icon + text, never colour only |
| `PaletteItem` | default, active | 56px square, label under icon |
| `CircuitNode` | battery, bulb, switch | Bulb has `bulb-glow` layer |
| `StepNav` | Learn, Predict & Build, Evidence | Current step marked with text and underline |

Icons: Lucide (`CheckCircle2`, `XCircle`, `HelpCircle`, `Zap`, `Lightbulb`, `ToggleLeft`, `Eraser`, `Undo2`, `Mic`).

## 8. Interaction states (every interactive element)
| State | Treatment |
|---|---|
| Default | Glass fill, `glass-border` |
| Hover (pointer only) | `glass-fill-strong` |
| Focus-visible | 2px white ring, 2px offset |
| Active/pressed | Fill strong, 1px inset darker, 100ms |
| Selected | `glass-border-strong` + check or filled indicator |
| Disabled | 40% opacity, `not-allowed`, reason text beside it |
| Loading | Spinner + label change; button stays same width |
| Error | Coral icon + text message below the control |

Motion: UI changes 150ms; bulb glow-up 500ms; particles continuous, speed capped. `prefers-reduced-motion`: no particles; show static arrowheads and current numbers instead; bulbs switch without fade.

## 9. UI acceptance checks (add to the gates)
1. No raw hex colours in `src/components` (grep check).
2. Every text/background pair at least 4.5:1, checked on the rendered blur.
3. Full keyboard path: Learn to Evidence without a mouse; focus always visible.
4. 1440x900 and 1180x820 fit without page scroll on Predict & Build.
5. Palette placement and wiring work by touch on the iPad.
6. All three verdict states shown in a screenshot, readable in greyscale.
7. Reduced-motion mode shows the same information with no animation.
8. Backdrop-filter off: panels still readable (solid fallback).

## 10. Deferred (do not build until the core path passes)
3D hero element, freehand/Pencil recognition, voice input, charts, second topic, accounts.
