import type { SimulateResult } from '../api/client'
import { LIT_POWER_W, type LessonSeed } from '../lessons/lesson'
import { resultPanel } from '../lens/triptych'
import CircuitPreview from './CircuitPreview'
import ReadoutValue from './ReadoutValue'
import SimulationResultView from './SimulationResultView'

/** Triptych: the upload, the reviewed reading, and the solver measurement. */
export default function RealityTriptych({
  image,
  seed,
  result,
  bulbIds,
}: {
  image: string
  seed: LessonSeed
  result: SimulateResult
  bulbIds: string[]
}) {
  const measured = result.ok
    ? bulbIds.filter((id) => result.components[id] !== undefined)
    : []
  return (
    <section
      aria-label="Confirmed upload: photo, reading, and measurement"
      className="grid gap-3 md:grid-cols-3"
    >
      <div className="glass-panel flex flex-col gap-2 p-4">
        <h4 className="text-base font-semibold">Your photo or sketch</h4>
        <img
          src={image}
          alt="Confirmed upload"
          className="max-h-64 self-start rounded-[10px]"
        />
      </div>
      <div className="glass-panel flex flex-col gap-2 p-4">
        <h4 className="text-base font-semibold">Confirmed circuit</h4>
        <CircuitPreview seed={seed} label="Confirmed circuit" result={result} />
        <p className="text-ink-muted text-xs">Proposed by Meta, reviewed by you.</p>
      </div>
      <div className="glow-card evidence-reveal flex flex-col gap-2 p-5" role="status">
        {resultPanel(result) === 'numbers' ? (
          <>
            <p className="text-sm font-semibold">Confirmed circuit tested</p>
            {measured.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {measured.map((id) => {
                  const reading = result.ok ? result.components[id] : undefined
                  if (reading === undefined) {
                    return null
                  }
                  return (
                    <li
                      key={id}
                      className="glass-panel flex flex-col gap-0.5 rounded-[10px] p-3"
                    >
                      <p className="font-mono text-sm font-medium">{id}</p>
                      <p className="text-sm">
                        <ReadoutValue value={reading.current} unit="A" />
                      </p>
                      <p className="text-sm">
                        <ReadoutValue value={reading.power} unit="W" />
                      </p>
                      <p className="text-ink-muted text-xs">
                        {reading.power > LIT_POWER_W ? 'Bulb lit' : 'Bulb dark'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm">
                The simulator solved your confirmed circuit with no faults.
              </p>
            )}
            <p className="text-sm">The solver measured this confirmed circuit.</p>
          </>
        ) : (
          <>
            <p className="font-mono text-sm font-medium">
              {result.error_code ?? 'INVALID_CIRCUIT'}
            </p>
            <SimulationResultView result={result} />
          </>
        )}
        <p className="text-ink-muted text-xs">Computed by Verityn&apos;s solver.</p>
      </div>
    </section>
  )
}
