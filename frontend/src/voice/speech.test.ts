import { describe, expect, it, vi } from 'vitest'
import { createSpeaker } from './speech'

/** NOTE: mocked browser capabilities only. These tests prove the state
 *  machine and error mapping, not real microphone or audio playback. */

function synthesisHost() {
  const spoken: Record<string, unknown>[] = []
  const synthesis = {
    speak: vi.fn((utterance: Record<string, unknown>) => spoken.push(utterance)),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }
  const host: Record<string, unknown> = {
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: class {
      text: string
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    },
  }
  return { host, synthesis, spoken }
}

describe('createSpeaker', () => {
  it('speaks, pauses, resumes, and stops with state callbacks', () => {
    const { host, synthesis, spoken } = synthesisHost()
    const states: string[] = []
    const speaker = createSpeaker(host, (state) => states.push(state))
    speaker.speak('What breaks the loop?')
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
    expect(spoken[0]?.text).toBe('What breaks the loop?')
    speaker.pause()
    speaker.resume()
    speaker.stop()
    expect(synthesis.cancel).toHaveBeenCalled()
    expect(states).toEqual(['speaking', 'paused', 'speaking', 'idle'])
  })

  it('returns to idle when the utterance ends or errors', () => {
    const { host, spoken } = synthesisHost()
    const states: string[] = []
    const speaker = createSpeaker(host, (state) => states.push(state))
    speaker.speak('Hello')
    const utterance = spoken[0]
    ;(utterance?.onend as (() => void) | null)?.()
    speaker.speak('Again')
    ;(spoken[1]?.onerror as (() => void) | null)?.()
    expect(states).toEqual(['speaking', 'idle', 'speaking', 'idle'])
  })

  it('reports unsupported without a synthesis host', () => {
    const states: string[] = []
    const speaker = createSpeaker({}, (state) => states.push(state))
    expect(states).toEqual([])
    speaker.speak('Hello')
    expect(states).toEqual(['unsupported'])
  })
})
