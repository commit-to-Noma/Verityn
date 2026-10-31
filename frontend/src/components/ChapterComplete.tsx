import { CircleCheckBig } from 'lucide-react'

/** Chapter gate: evidence stays visible and the learner can always continue. */
export default function ChapterComplete({
  title,
  detail,
  nextLabel,
  auto,
  onContinue,
}: {
  title: string
  detail: string
  nextLabel: string
  auto: boolean
  onContinue: () => void
}) {
  return (
    <div
      className="glass-panel evidence-reveal flex flex-col gap-3 p-4"
      aria-label="Chapter complete"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <CircleCheckBig className="h-6 w-6 shrink-0 text-ok" aria-hidden="true" />
        <div>
          <p className="text-base font-medium text-ink">{title}</p>
          <p className="text-sm text-ink-muted">{detail}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="bg-flow text-on-accent flex min-h-[44px] items-center justify-center rounded-[10px] px-4 text-sm font-medium"
        >
          {nextLabel}
        </button>
        {auto && (
          <p className="auto-note text-sm text-ink-muted">
            <span aria-hidden="true">Moving on shortly…</span>
            <span className="sr-only">The next lab step will open shortly.</span>
          </p>
        )}
      </div>
    </div>
  )
}
