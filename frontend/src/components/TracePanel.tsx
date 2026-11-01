import { useEffect, useState } from 'react'
import type { TraceEvent } from '../api/client'
import { subscribeTraceEvents, traceEvents } from '../trace/session'

function guardLabel(guard: string): string {
  if (guard === 'accepted') {
    return 'Accepted'
  }
  if (guard.startsWith('fallback:')) {
    return 'Template fallback'
  }
  if (guard.startsWith('rejected:')) {
    return `Rejected · ${guard.slice('rejected:'.length)}`
  }
  return guard
}

function deciderLabel(decidedBy: string): string {
  if (decidedBy === 'solver') {
    return 'Decided by the solver'
  }
  if (decidedBy === 'validator') {
    return 'Checked by code'
  }
  return 'No model output to check'
}

function TraceRow({ event }: { event: TraceEvent }) {
  return (
    <li className="glass-panel grid min-w-0 gap-3 p-4 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="text-flow text-xs font-semibold uppercase tracking-[0.18em]">
          What Meta did
        </p>
        <p className="mt-1 font-mono text-sm">{event.tool}</p>
        <p className="text-ink-muted text-xs">
          {event.input} → {event.output} · {event.ms} ms
        </p>
        {event.attempts !== undefined && event.attempts > 1 && (
          <p className="text-ink-muted text-xs">{event.attempts} attempts</p>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-flow text-xs font-semibold uppercase tracking-[0.18em]">
          What code checked
        </p>
        <p className="mt-1 text-sm font-medium">{guardLabel(event.guard)}</p>
        <p className="text-ink-muted text-xs">{deciderLabel(event.decided_by)}</p>
      </div>
    </li>
  )
}

/** Session drawer: every AI call beside code's verdict on it. Real events only. */
export default function TracePanel() {
  const [events, setEvents] = useState<TraceEvent[]>(traceEvents)
  useEffect(() => subscribeTraceEvents(() => setEvents(traceEvents())), [])
  return (
    <details className="glass-panel p-4">
      <summary className="min-h-[44px] cursor-pointer content-center text-sm font-semibold">
        What Meta did / What code checked
        <span className="text-ink-muted ml-2 font-normal">
          {events.length === 0 ? 'No calls yet' : `${events.length} call${events.length === 1 ? '' : 's'}`}
        </span>
      </summary>
      {events.length === 0 ? (
        <p className="text-ink-muted mt-3 text-sm">
          No Meta calls yet this session. Coach questions, transcriptions, and diagram
          proposals appear here with code&apos;s verdict on each one.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {[...events].reverse().map((event, index) => (
            <TraceRow key={`${event.t}-${index}`} event={event} />
          ))}
        </ol>
      )}
    </details>
  )
}
