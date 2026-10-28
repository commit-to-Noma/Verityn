import { FlaskConical } from 'lucide-react'

/** Cinematic opening: one objective, one action. Nothing else competes. */
export default function LabIntro({ onEnter }: { onEnter: () => void }) {
  return (
    <section aria-labelledby="intro-heading" className="intro-ambient -m-4 flex flex-col items-center gap-6 px-4 py-16 text-center sm:-m-6 sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-flow">
        Verityn laboratory
      </p>
      <h2 id="intro-heading" className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
        Predict. Build. Reality check.
      </h2>
      <p className="max-w-md text-base text-ink-muted">
        One broken circuit. Predict what it will do, fix it with your own hands, and let the
        simulator — not the AI — judge your reasoning. Then prove it alone.
      </p>
      <ol className="flex items-center gap-2 text-xs font-medium text-ink-muted" aria-label="The journey">
        <li className="rounded-full border border-glass-border px-3 py-1">Predict</li>
        <li aria-hidden="true">→</li>
        <li className="rounded-full border border-glass-border px-3 py-1">Build</li>
        <li aria-hidden="true">→</li>
        <li className="rounded-full border border-glass-border px-3 py-1">Twist</li>
        <li aria-hidden="true">→</li>
        <li className="rounded-full border border-glass-border px-3 py-1">Solo</li>
      </ol>
      <button
        type="button"
        onClick={onEnter}
        className="bg-flow text-on-accent flex min-h-[52px] items-center gap-2 rounded-[12px] px-8 text-base font-semibold"
      >
        <FlaskConical className="h-5 w-5" aria-hidden="true" />
        Enter the lab
      </button>
      <p className="max-w-sm text-xs text-ink-muted">
        The AI coach stays quiet until you commit to a prediction — and switches off entirely
        for the final challenge.
      </p>
    </section>
  )
}
