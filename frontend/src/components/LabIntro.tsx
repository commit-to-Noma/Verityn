import { Atom, Dna, FlaskConical, DraftingCompass, ScanLine, Play } from 'lucide-react'

const METHOD = [
  { step: 'Predict', doing: 'Commit to what the circuit will do, in your own words.' },
  { step: 'Build', doing: 'Wire the circuit on the canvas from your prediction.' },
  { step: 'Simulate', doing: 'Run the deterministic solver and watch what happens.' },
  { step: 'Explain', doing: 'Answer the coach and compare evidence with your claim.' },
  { step: 'Try independently', doing: 'Solve a fresh circuit with the AI coach off.' },
] as const

/** Platform homepage: the Verityn vision, with working entries into the lab. */
export default function LabIntro({
  onEnter,
  onExploreLens,
  onDemo,
}: {
  onEnter: () => void
  onExploreLens: () => void
  onDemo: () => void
}) {
  return (
    <section aria-labelledby="intro-heading" className="intro-ambient -m-4 flex flex-col items-center gap-8 px-4 py-16 text-center sm:-m-6 sm:py-24">
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-flow">
          Verityn laboratory
        </p>
        <h2 id="intro-heading" className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
          Verityn — Learn by predicting, testing, and explaining.
        </h2>
        <p className="max-w-md text-base text-ink-muted">
          Turn real circuit diagrams into interactive experiments. Investigate the model, test
          your ideas, and use measured evidence to understand what happens.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onEnter}
            className="bg-flow text-on-accent flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] px-8 text-base font-semibold"
          >
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
            Start the circuit lab
          </button>
          <button
            type="button"
            onClick={onExploreLens}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] border border-glass-border px-8 text-base font-semibold"
          >
            <ScanLine className="h-5 w-5" aria-hidden="true" />
            Turn a diagram into an experiment
          </button>
          <button
            type="button"
            onClick={onDemo}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] border border-glass-border px-8 text-base font-semibold"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            Explore the guided demo
          </button>
        </div>
      </div>
      <div className="flex w-full max-w-2xl flex-col gap-3 text-left">
        <h3 className="text-center text-base font-semibold">How learning works here</h3>
        <ol className="grid gap-2 sm:grid-cols-5">
          {METHOD.map((item) => (
            <li key={item.step} className="glass-panel flex flex-col gap-1 p-3">
              <p className="text-sm font-semibold">{item.step}</p>
              <p className="text-xs text-ink-muted">{item.doing}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="glass-panel flex w-full max-w-2xl flex-col gap-3 p-4 text-left">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-flow" aria-hidden="true" />
          <p className="text-base font-semibold">Reality Lens</p>
          <span className="ml-auto rounded-full border border-glass-border px-2.5 py-1 text-[11px] font-medium text-ink-muted">
            Experimental
          </span>
        </div>
        <p className="text-sm text-ink-muted">
          Photograph a schematic and review a proposed circuit beside the original: Meta vision
          models interpret and localize the diagram, you review and correct the proposal,
          Verityn holds the confirmed editable circuit, and the deterministic solver computes
          every result. If extraction is unavailable, the circuit lab and verified samples
          still work.
        </p>
        <div>
          <button
            type="button"
            onClick={onExploreLens}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Open Reality Lens →
          </button>
        </div>
      </div>
      <div className="grid w-full max-w-2xl gap-3 text-left sm:grid-cols-2">
        <div className="glass-panel flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Atom className="h-5 w-5 text-flow" aria-hidden="true" />
            <p className="text-base font-semibold">Physics</p>
            <span className="ml-auto rounded-full border border-ok/60 px-2.5 py-1 text-[11px] font-medium text-ok">
              Active demo
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            One broken circuit. Predict what it will do, fix it, and survive the reality check.
          </p>
          <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted" aria-label="The journey">
            <li className="rounded-full border border-glass-border px-3 py-1">Predict</li>
            <li aria-hidden="true">→</li>
            <li className="rounded-full border border-glass-border px-3 py-1">Build</li>
            <li aria-hidden="true">→</li>
            <li className="rounded-full border border-glass-border px-3 py-1">Reality Check</li>
            <li aria-hidden="true">→</li>
            <li className="rounded-full border border-glass-border px-3 py-1">Solo</li>
          </ol>
          <div>
            <button
              type="button"
              onClick={onEnter}
              className="bg-flow text-on-accent flex min-h-[52px] items-center gap-2 rounded-[12px] px-8 text-base font-semibold"
            >
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
              Enter the lab
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="glass-panel flex items-center gap-3 p-4 opacity-70">
            <Dna className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <div>
              <p className="text-base font-semibold">Biology</p>
              <p className="text-xs text-ink-muted">Coming next</p>
            </div>
          </div>
          <div className="glass-panel flex items-center gap-3 p-4 opacity-70">
            <FlaskConical className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <div>
              <p className="text-base font-semibold">Chemistry</p>
              <p className="text-xs text-ink-muted">Planned</p>
            </div>
          </div>
          <div className="glass-panel flex items-center gap-3 p-4 opacity-70">
            <DraftingCompass className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <div>
              <p className="text-base font-semibold">Engineering Systems</p>
              <p className="text-xs text-ink-muted">Planned</p>
            </div>
          </div>
        </div>
      </div>
      <p className="max-w-sm text-xs text-ink-muted">
        The AI asks the question. The simulator supplies the evidence. You make the meaning.
      </p>
    </section>
  )
}
