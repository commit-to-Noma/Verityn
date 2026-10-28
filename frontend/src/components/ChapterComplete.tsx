import { CircleCheckBig } from 'lucide-react'

/** Chapter gate: the learner pauses on the evidence, then continues.
 * Demo mode adds an auto-advance timer; the button always works. */
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
    <div className="glass-panel evidence-reveal flex flex-col gap-3 p-4" aria-live="polite">
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
            <span aria-hidden="true">Auto-continuing…</span>
            <span className="sr-only">Automatic demo advance is on.</span>
          </p>
        )}
      </div>
    </div>
  )
}
