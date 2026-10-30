import { PROGRESS_STEPS } from '../journey/stages'

/** Compact chapter progress for the journey header. */
export default function JourneyProgress({ active }: { active: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Journey progress">
      {PROGRESS_STEPS.map((step, index) => {
        const done = index < active
        const current = index === active
        return (
          <li key={step} className="flex items-center gap-1.5">
            {index > 0 && <span className="h-px w-3 bg-glass-border-strong" aria-hidden="true" />}
            <span
              aria-current={current ? 'step' : undefined}
              title={done ? `${step}  -  complete` : current ? `${step}  -  current` : step}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                done
                  ? 'border-ok/50 text-ok'
                  : current
                    ? 'border-flow/60 text-flow'
                    : 'border-glass-border text-ink-muted'
              }`}
            >
              {step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
