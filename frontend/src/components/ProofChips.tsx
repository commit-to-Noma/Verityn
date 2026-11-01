import { useEffect, useState } from 'react'
import { subscribeTraceEvents, traceEvents } from '../trace/session'
import { useProofMode } from '../proof/store'

/** Proof-only chips naming the serving tool and guard verdict per stage. */
export default function ProofChips({ stages }: { stages: string[] }) {
  const proof = useProofMode()
  const [, setTick] = useState(0)
  useEffect(() => subscribeTraceEvents(() => setTick((tick) => tick + 1)), [])
  if (!proof) {
    return null
  }
  const chips = traceEvents().filter(
    (event) => event.stage !== undefined && event.stage !== null && stages.includes(event.stage),
  )
  if (chips.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap gap-2" aria-label="Proof chips">
      {chips.map((event, index) => (
        <span
          key={`${event.t}-${index}`}
          className="border-glass-border rounded-full border px-3 py-1 font-mono text-[11px] text-ink-muted"
        >
          {event.tool} · {event.guard}
        </span>
      ))}
    </div>
  )
}
