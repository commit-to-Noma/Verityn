import { ArrowRight, FlaskConical, Play, ScanLine } from 'lucide-react'
import HealthStatus from './HealthStatus'

const TRANSFORMATION = [
  { step: 'Diagram', doing: 'A real schematic or photo.' },
  { step: 'Meta interpretation', doing: 'Components, terminals, and wires proposed.' },
  { step: 'Editable circuit', doing: 'You review and correct the model.' },
  { step: 'Solver evidence', doing: 'Current, power, and verdict measured.' },
] as const

const STACK = [
  { name: 'Meta Muse Spark', doing: 'Interprets the diagram and asks the next question.' },
  { name: 'Reality Lens', doing: 'Turns visual evidence into a circuit proposal.' },
  { name: 'Verityn Solver', doing: 'Calculates the physical result.' },
] as const

const JOURNEY = ['Predict', 'Build', 'Simulate', 'Explain', 'Try independently'] as const

/** Homepage: one transformation, two entries, honest technology credits. */
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
    <section aria-labelledby="intro-heading" className="intro-ambient -m-4 flex flex-col items-center gap-10 px-4 py-16 text-center sm:-m-6 sm:py-24">
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-flow">
          Verityn laboratory
        </p>
        <h2 id="intro-heading" className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
          Verityn — Learn by predicting, testing, and explaining.
        </h2>
        <p className="max-w-md text-base text-ink-muted">
          Turn a static circuit diagram into a confirmed, editable, solver-backed experiment.
        </p>
      </div>

      <ol aria-label="How Verityn transforms a diagram" className="grid w-full max-w-2xl gap-2 text-left sm:grid-cols-4">
        {TRANSFORMATION.map((item, index) => (
          <li key={item.step} className="glass-panel relative flex flex-col gap-1 p-3">
            <p className="text-sm font-semibold">{item.step}</p>
            <p className="text-xs text-ink-muted">{item.doing}</p>
            {index < TRANSFORMATION.length - 1 && (
              <ArrowRight
                className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-flow sm:block"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onExploreLens}
            className="bg-flow text-on-accent flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] px-8 text-base font-semibold"
          >
            <ScanLine className="h-5 w-5" aria-hidden="true" />
            Start with a diagram
          </button>
          <button
            type="button"
            onClick={onEnter}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] border border-glass-border px-8 text-base font-semibold"
          >
            <FlaskConical className="h-5 w-5" aria-hidden="true" />
            Learn through the guided circuit lab
          </button>
        </div>
        <button
          type="button"
          onClick={onDemo}
          className="text-ink-muted flex min-h-[44px] items-center gap-2 text-sm underline-offset-4 hover:text-ink hover:underline"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Watch the guided demo
        </button>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-2">
        <h3 className="text-sm font-semibold">How it works</h3>
        <ol className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-ink-muted" aria-label="The learning method">
          {JOURNEY.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true">→</span>
              )}
              <span className="rounded-full border border-glass-border px-3 py-1">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-2 text-left">
        <h3 className="text-center text-sm font-semibold">What does what</h3>
        <ul className="grid gap-2 sm:grid-cols-3">
          {STACK.map((item) => (
            <li key={item.name} className="glass-panel flex flex-col gap-1 p-3">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-ink-muted">{item.doing}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="max-w-2xl text-xs text-ink-muted">
        Active demo: Physics. Planned next: Biology · Chemistry · Engineering Systems.
      </p>
      <p className="max-w-sm text-xs text-ink-muted">
        The AI asks the question. The simulator supplies the evidence. You make the meaning.
      </p>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <HealthStatus compact />
      </div>
    </section>
  )
}
