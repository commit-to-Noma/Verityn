import { describe, expect, it, vi } from 'vitest'
import type { TraceEvent } from '../api/client'
import {
  clearTraceEvents,
  recordTraceEvent,
  setTraceStage,
  subscribeTraceEvents,
  traceCounts,
  traceEvents,
} from './session'

function event(partial: Partial<TraceEvent> = {}): TraceEvent {
  return {
    tool: 'prototype-fake',
    input: 'text',
    output: 'structured-hint',
    guard: 'fallback:template',
    decided_by: 'none',
    ms: 3,
    t: '2026-10-31T00:00:00+00:00',
    ...partial,
  }
}

describe('trace session store', () => {
  it('records real events and ignores missing traces', () => {
    clearTraceEvents()
    recordTraceEvent(undefined)
    recordTraceEvent(event())
    expect(traceEvents()).toHaveLength(1)
    expect(traceEvents()[0]?.tool).toBe('prototype-fake')
  })

  it('notifies subscribers on record and clear', () => {
    clearTraceEvents()
    const listener = vi.fn()
    const unsubscribe = subscribeTraceEvents(listener)
    recordTraceEvent(event())
    clearTraceEvents()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    recordTraceEvent(event())
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stamps the active stage without mutating the served event', () => {
    clearTraceEvents()
    setTraceStage('reality-build')
    const served = event()
    recordTraceEvent(served)
    expect(traceEvents()[0]?.stage).toBe('reality-build')
    expect('stage' in served).toBe(false)
    setTraceStage(null)
    recordTraceEvent(event())
    expect(traceEvents()[1]).not.toHaveProperty('stage')
  })

  it('bounds the session to the newest 100 events', () => {
    clearTraceEvents()
    for (let i = 0; i < 120; i++) {
      recordTraceEvent(event({ ms: i }))
    }
    const events = traceEvents()
    expect(events).toHaveLength(100)
    expect(events[0]?.ms).toBe(20)
    expect(events[99]?.ms).toBe(119)
  })

  it('counts Meta calls, rejections, and fallbacks for the evidence card', () => {
    expect(
      traceCounts([
        event({ tool: 'muse-spark-1.3', guard: 'accepted', decided_by: 'validator' }),
        event({ tool: 'muse-spark-1.3', guard: 'rejected:leak', decided_by: 'validator' }),
        event({ tool: 'prototype-fake', guard: 'fallback:template' }),
        event({ tool: 'deterministic', guard: 'accepted', decided_by: 'solver' }),
      ]),
    ).toEqual({ metaCalls: 2, rejections: 1, fallbacks: 1 })
  })
})
