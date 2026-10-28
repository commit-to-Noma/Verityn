import { Atom, Dna, FlaskConical, DraftingCompass } from 'lucide-react'

/** Platform hub: the Verityn vision, with Physics as the active demo module. */
export default function LabIntro({ onEnter }: { onEnter: () => void }) {
  return (
    <section aria-labelledby="intro-heading" className="intro-ambient -m-4 flex flex-col items-center gap-6 px-4 py-16 text-center sm:-m-6 sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-flow">
        Verityn laboratory
      </p>
      <h2 id="intro-heading" className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
        Verityn: The Evidence-Grounded Learning Lab for STEM.
      </h2>
      <p className="max-w-md text-base text-ink-muted">
        Predict first, build with your own hands, and let the simulator — not the AI — judge
        your reasoning. Then prove it alone.
      </p>
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
            One broken circuit. Predict what it will do, fix it, and survive the twist.
          </p>
          <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted" aria-label="The journey">
            <li className="rounded-full border border-glass-border px-3 py-1">Predict</li>
            <li aria-hidden="true">→</li>
            <li className="rounded-full border border-glass-border px-3 py-1">Build</li>
            <li aria-hidden="true">→</li>
            <li className="rounded-full border border-glass-border px-3 py-1">Twist</li>
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
        The AI coach stays quiet until you commit to a prediction — and switches off entirely
        for the final challenge.
      </p>
    </section>
  )
}
