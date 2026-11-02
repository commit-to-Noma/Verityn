import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { clearTraceEvents, recordTraceEvent } from '../trace/session'
import { clearVoiceTimings, recordVoiceTiming } from '../voice/voiceTimings'
import TracePanel from './TracePanel'

afterEach(() => {
  clearTraceEvents()
  clearVoiceTimings()
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

  it('keeps voice stage labels, timings, and raw transcripts in Trace', () => {
    recordVoiceTiming({
      stage: 'reality-build',
      speechToTranscriptMs: 412,
      transcriptToCoachReplyMs: 286,
      transcript: 'Um, close the switch.',
    })

    const markup = renderToStaticMarkup(<TracePanel />)
    expect(markup).toContain('Voice captures')
    expect(markup).toContain('reality-build: speech end → transcript 412 ms')
    expect(markup).toContain('transcript → coach reply 286 ms')
    expect(markup).toContain('raw: “Um, close the switch.”')
  })
})
