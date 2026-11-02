import type { Choice } from '../lessons/lesson'
import { CHOICE_LABELS } from '../lessons/lesson'
import ReadoutValue from './ReadoutValue'

/** Personal recap: what you predicted, what you tested, and whether they agreed. */
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
  const agreed = choice === 'yes' ? lit : choice === 'no' ? !lit : null
  const reason = lit
    ? 'the loop gives current a complete path through the bulb'
    : 'the loop is broken, so no current can reach the bulb'
  return (
    <p className="text-sm">
      {choice === 'not_sure' ? (
        <>You weren&apos;t sure what would happen. You tested the circuit and the solver measured{' '}</>
      ) : (
        <>You predicted {CHOICE_LABELS[choice]}. You tested the circuit and the solver measured{' '}</>
      )}
      <ReadoutValue value={current} unit="A" />
      {' and '}
      <ReadoutValue value={power} unit="W" />
      {' for '}
      {component}
      {`, so it ${lit ? 'lit' : 'stayed dark'}. `}
      {agreed === null
        ? `Now you have your answer: ${reason}.`
        : `That ${agreed ? 'agreed' : 'disagreed'} with your prediction: ${reason}.`}
    </p>
  )
}
