import type { TraceEvent } from '../api/client'

/** Session trace store: real AI-call events only, newest last, bounded. */
const MAX_EVENTS = 100

let events: TraceEvent[] = []
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

export function recordTraceEvent(event: TraceEvent | undefined): void {
  if (event === undefined) {
    return
  }
  events = [...events.slice(-(MAX_EVENTS - 1)), event]
  notify()
}

export function traceEvents(): TraceEvent[] {
  return [...events]
}

export function subscribeTraceEvents(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Counts for the evidence card: Meta calls, code rejections, fallbacks. */
export function traceCounts(events: TraceEvent[]): {
  metaCalls: number
  rejections: number
  fallbacks: number
} {
  let metaCalls = 0
  let rejections = 0
  let fallbacks = 0
  for (const event of events) {
    if (event.tool.startsWith('meta-') || event.tool.startsWith('muse-')) {
      metaCalls += 1
    }
    if (event.guard.startsWith('rejected:')) {
      rejections += 1
    }
    if (event.guard.startsWith('fallback:')) {
      fallbacks += 1
    }
  }
  return { metaCalls, rejections, fallbacks }
}

/** Tests only: reset the session store. */
export function clearTraceEvents(): void {
  events = []
  notify()
}
