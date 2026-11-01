import { Lock } from 'lucide-react'
import type { Prediction } from '../lessons/lesson'
import { CHOICE_LABELS } from '../lessons/lesson'

/** Restates the recorded prediction plus the stage hint above the work. */
export default function PredictionSummary({
  prediction,
  hint,
  hideHint = false,
}: {
  prediction: Prediction
  hint: string
  /** Solo shows the recap without the wiring guidance. */
  hideHint?: boolean
}) {
  return (
    <div className="rounded-2xl border border-glass-border p-4">
      <p className="text-sm">
        <span className="text-ink-muted">Your prediction: </span>
        {CHOICE_LABELS[prediction.choice]}
        {prediction.why.trim() === '' ? '' : `  -  “${prediction.why.trim()}”`}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-glass-border px-2.5 py-1 text-xs font-medium text-ink-muted">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        Locked in — testing this against the circuit
      </p>
      {!hideHint && <p className="mt-2 text-sm text-ink-muted">{hint}</p>}
    </div>
  )
}
