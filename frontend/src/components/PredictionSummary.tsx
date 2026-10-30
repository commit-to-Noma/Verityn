import type { Prediction } from '../lessons/lesson'
import { CHOICE_LABELS } from '../lessons/lesson'

/** Restates the recorded prediction plus the stage hint above the work. */
export default function PredictionSummary({
  prediction,
  hint,
}: {
  prediction: Prediction
  hint: string
}) {
  return (
    <div className="rounded-2xl border border-glass-border p-4">
      <p className="text-sm">
        <span className="text-ink-muted">Your prediction: </span>
        {CHOICE_LABELS[prediction.choice]}
        {prediction.why.trim() === '' ? '' : `  -  “${prediction.why.trim()}”`}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>
    </div>
  )
}
