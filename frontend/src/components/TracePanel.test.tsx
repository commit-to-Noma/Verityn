import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { clearTraceEvents, recordTraceEvent } from '../trace/session'
import TracePanel from './TracePanel'

afterEach(() => {
  clearTraceEvents()
})

describe('TracePanel', () => {
  it('shows retry attempts for recorded provider events', () => {
    recordTraceEvent({
      tool: 'muse-spark-1.3',
      input: 'text',
      output: 'structured-hint',
      guard: 'accepted',
      decided_by: 'validator',
      ms: 842,
      attempts: 2,
      t: '2026-10-31T00:00:00+00:00',
    })

    const markup = renderToStaticMarkup(<TracePanel />)
    expect(markup).toContain('2 attempts')
  })
})
