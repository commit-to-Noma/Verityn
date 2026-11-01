import type { Choice } from '../lessons/lesson'
import { CHOICE_LABELS } from '../lessons/lesson'
import ReadoutValue from './ReadoutValue'

/** Kind, solver-grounded comparison used in Reality Check, Solo, and Finale. */
export default function PredictionVerdictLine({
  choice,
  current,
  power,
  lit,
  component = 'the bulb',
}: {
  choice: Choice
  current: number
  power: number
  lit: boolean
  component?: string
}) {
  return (
    <p className="text-sm">
      You predicted {CHOICE_LABELS[choice]}. The solver measured{' '}
      <ReadoutValue value={current} unit="A" />
      {' and '}
      <ReadoutValue value={power} unit="W" />
      {' for '}
      {component}
      {`, so ${lit ? 'it lit' : 'it stayed dark'}. `}
      This tests your prediction against the model, not you.
    </p>
  )
}
