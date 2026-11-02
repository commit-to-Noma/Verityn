import { Lock } from 'lucide-react'
import type { Prediction } from '../lessons/lesson'
import { CHOICE_LABELS } from '../lessons/lesson'
import { cleanTranscriptForDisplay } from '../voice/displayTranscript'

/** Restates the recorded prediction plus the stage hint above the work. */
export default function PredictionSummary({
  prediction,
  hint,
  hideHint = false,
  compact = false,
  question,
}: {
  prediction: Prediction
  hint: string
  /** Solo shows the recap without the wiring guidance. */
  hideHint?: boolean
  /** Completed screens keep the recap to a single learner-facing chip. */
  compact?: boolean
  /** Prompt text for echo-stripping; display shows cleaned words. */
  question?: string
}) {
  const why = cleanTranscriptForDisplay(prediction.why, question)
  if (compact) {
    return (
      <p
        className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-glass-border px-3 py-2 text-sm"
        aria-label="Prediction recap"
      >
        <span className="text-ink-muted">Your prediction</span>
        <span className="font-semibold">{CHOICE_LABELS[prediction.choice]}</span>
        {why !== '' && (
          <span className="min-w-0 break-words text-ink-muted">
            “{why}”
          </span>
        )}
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-glass-border p-4">
      <p className="text-sm">
        <span className="text-ink-muted">Your prediction: </span>
        {CHOICE_LABELS[prediction.choice]}
        {why === '' ? '' : `  -  “${why}”`}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-glass-border px-2.5 py-1 text-xs font-medium text-ink-muted">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        Locked in — testing this against the circuit
      </p>
      {!hideHint && <p className="mt-2 text-sm text-ink-muted">{hint}</p>}
    </div>
  )
}
