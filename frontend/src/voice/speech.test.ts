import { describe, expect, it, vi } from 'vitest'
import { createRecognizer, createSpeaker, speechSupport } from './speech'

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

describe('speechSupport', () => {
  it('detects synthesis and recognition separately', () => {
    expect(speechSupport({})).toEqual({ synthesis: false, recognition: false })
    expect(speechSupport({ speechSynthesis: {} })).toEqual({ synthesis: true, recognition: false })
    expect(speechSupport({ webkitSpeechRecognition: class {} })).toEqual({
      synthesis: false,
      recognition: true,
    })
  })
})

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
    speaker.speak('Hello')
    expect(states).toEqual(['unsupported', 'unsupported'])
  })
})

function recognitionHost() {
  const instances: Record<string, unknown>[] = []
  const host: Record<string, unknown> = {
    SpeechRecognition: class {
      onresult: ((event: unknown) => void) | null = null
      onerror: ((event: unknown) => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn()
      stop = vi.fn()
      abort = vi.fn()
      constructor() {
        instances.push(this as unknown as Record<string, unknown>)
      }
    },
  }
  return { host, instances }
}

describe('createRecognizer', () => {
  it('delivers transcripts and ignores a second start', () => {
    const { host, instances } = recognitionHost()
    const transcripts: string[] = []
    const states: string[] = []
    const recognizer = createRecognizer(host, {
      onTranscript: (text) => transcripts.push(text),
      onState: (state) => states.push(state),
    })
    recognizer.start()
    recognizer.start()
    expect(instances).toHaveLength(1)
    const first = instances[0]
    ;(first?.onresult as ((event: unknown) => void) | null)?.({
      results: [[{ transcript: ' the switch is open ' }]],
    })
    expect(transcripts).toEqual(['the switch is open'])
    ;(first?.onend as (() => void) | null)?.()
    expect(states[0]).toBe('listening')
  })

  it('maps denial, silence, and service errors distinctly', () => {
    for (const [code, state] of [
      ['not-allowed', 'denied'],
      ['service-not-allowed', 'denied'],
      ['no-speech', 'no-speech'],
      ['network', 'unavailable'],
    ] as const) {
      const { host, instances } = recognitionHost()
      const states: string[] = []
      const recognizer = createRecognizer(host, {
        onTranscript: () => {},
        onState: (s) => states.push(s),
      })
      recognizer.start()
      ;(instances[0]?.onerror as ((event: unknown) => void) | null)?.({ error: code })
      expect(states).toEqual(['listening', state])
    }
  })

  it('stops an active session and reports unsupported hosts', () => {
    const { host } = recognitionHost()
    const states: string[] = []
    const recognizer = createRecognizer(host, {
      onTranscript: () => {},
      onState: (s) => states.push(s),
    })
    recognizer.start()
    recognizer.stop()
    expect(states).toEqual(['listening', 'idle'])
    const missing: string[] = []
    const none = createRecognizer({}, { onTranscript: () => {}, onState: (s) => missing.push(s) })
    none.start()
    expect(missing).toEqual(['unsupported', 'unsupported'])
  })
})
