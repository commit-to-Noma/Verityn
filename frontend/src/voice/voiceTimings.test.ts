import { describe, expect, it, vi } from 'vitest'
import {
  elapsedMs,
  readVoiceTimings,
  recordVoiceTiming,
  subscribeVoiceTimings,
} from './voiceTimings'

describe('voice timings', () => {
  it('records stage timing rows and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeVoiceTimings(listener)
    recordVoiceTiming({
      stage: 'reality-predict',
      speechToTranscriptMs: 480,
      transcriptToCoachReplyMs: null,
    })

    expect(readVoiceTimings()).toEqual([{
      stage: 'reality-predict',
      speechToTranscriptMs: 480,
      transcriptToCoachReplyMs: null,
    }])
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('measures non-negative elapsed milliseconds', () => {
    expect(elapsedMs(10.2, 510.7)).toBe(501)
    expect(elapsedMs(2, 1)).toBe(0)
  })
})
