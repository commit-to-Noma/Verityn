import type { Netlist, SimulateResult } from '../api/client'
import { bannerModel } from '../canvas/banner'
import AnimatedReadout from './AnimatedReadout'

/** Compact hero banner for the physical result: loop → current → outcome. */
export default function ResultBanner({
  result,
  netlist,
}: {
  result: SimulateResult
  netlist: Netlist
}) {
  const model = bannerModel(result, netlist)
  if (!model) {
    return null
  }
  return (
    <div
      className="glass-panel flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 p-4 text-center"
      role="status"
      aria-label={`Simulation result: ${model.state}, ${model.outcome}`}
    >
      <span className="text-sm font-semibold tracking-wide text-flow">{model.state}</span>
      <span className="text-ink-muted" aria-hidden="true">
        →
      </span>
      <span className="text-2xl font-medium">
        <AnimatedReadout value={model.amps} unit="A" />
      </span>
      <span className="text-ink-muted" aria-hidden="true">
        →
      </span>
      <span
        className={`text-sm font-semibold tracking-wide ${model.lit ? 'text-light' : 'text-ink-muted'}`}
      >
        {model.outcome}
      </span>
    </div>
  )
}
