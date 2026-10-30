import type { Netlist, SimulateResult, VerdictStatus } from '../api/client'
import type { Choice, LessonSeed } from '../lessons/lesson'
import {
  describeAddedWires,
  soloBulbReadings,
  soloPredictionLine,
  soloSuggestion,
  type BuiltEdge,
} from '../solo/summary'
import ReadoutValue from './ReadoutValue'
import { VerdictIcon } from './verdict'
import { VERDICT_LABELS } from './verdictLabels'

/** Solo result in four honest beats: prediction, change, measurement, suggestion.
 * Rendered instead of the plain verdict card in solo mode; every number comes
 * from the solved result for the circuit the learner built. */
export default function SoloResult({
  choice,
  claimComponent,
  seed,
  built,
  result,
  netlist,
  verdict,
}: {
  choice: Choice
  claimComponent: string
  seed: LessonSeed
  built: BuiltEdge[]
  result: SimulateResult
  netlist: Netlist
  verdict: VerdictStatus
}) {
  const readings = soloBulbReadings(result, netlist)
  return (
    <div className="glass-panel flex flex-col gap-3 p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <VerdictIcon status={verdict} />
        <p className="text-base font-medium text-ink">{VERDICT_LABELS[verdict]}</p>
      </div>
      <div>
        <p className="text-base font-medium text-ink">Your prediction</p>
        <p className="text-ink-muted text-sm">{soloPredictionLine(choice, claimComponent)}</p>
      </div>
      <div>
        <p className="text-base font-medium text-ink">What you changed</p>
        <p className="text-ink-muted text-sm">{describeAddedWires(seed, built)}</p>
      </div>
      <div>
        <p className="text-base font-medium text-ink">What the simulator measured</p>
        <ul className="mt-1 flex flex-col gap-1">
          {readings.map((reading) => (
            <li key={reading.id} className="flex items-baseline gap-2 text-sm">
              <span className="font-mono font-medium">{reading.id}</span>
              <span className="text-ink-muted ml-auto">
                <ReadoutValue value={reading.current} unit="A" />
                {' · '}
                <ReadoutValue value={reading.power} unit="W" />
                {reading.lit ? ' · lit' : ' · dark'}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted mt-1 text-xs">Measured by Verityn Solver</p>
      </div>
      <div>
        <p className="text-base font-medium text-ink">What this suggests</p>
        <p className="text-ink-muted text-sm">{soloSuggestion(readings)}</p>
      </div>
    </div>
  )
}
