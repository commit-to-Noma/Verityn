import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  latestCoachStatement,
  repeatCoach,
  speakCoach,
  stopCoach,
  subscribeCoachSpeechFinished,
  subscribeCoachStatement,
} from './coachVoice'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('coach voice playback', () => {
  it('speaks the latest message and can replay it after playback is stopped', () => {
    const utterances: { text: string; rate: number }[] = []
    const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] }
    vi.stubGlobal('speechSynthesis', synthesis)
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        rate = 1
        pitch = 1
        voice: SpeechSynthesisVoice | null = null
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        text: string
        constructor(text: string) {
          this.text = text
          utterances.push(this)
        }
      },
    )
    const statements: string[] = []
    const unsubscribeStatement = subscribeCoachStatement((text) => statements.push(text))

    expect(speakCoach('Connect the open ends.')).toBe(true)
    expect(statements).toEqual(['Connect the open ends.'])
    expect(synthesis.cancel).toHaveBeenCalledTimes(1)
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
    expect(utterances[0]).toMatchObject({ text: 'Connect the open ends.', rate: 0.92, pitch: 1.04 })
    expect(latestCoachStatement()).toBe('Connect the open ends.')

    stopCoach()
    expect(synthesis.cancel).toHaveBeenCalledTimes(2)
    expect(repeatCoach()).toBe(true)
    expect(synthesis.cancel).toHaveBeenCalledTimes(3)
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    expect(utterances[1]?.text).toBe('Connect the open ends.')
    unsubscribeStatement()
  })

  it('skips re-speaking an identical repeat but replays on explicit repeat', () => {
    const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] }
    vi.stubGlobal('speechSynthesis', synthesis)
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        onend: (() => void) | null = null
        text: string
        constructor(text: string) {
          this.text = text
        }
      },
    )
    expect(speakCoach('Leave the switch open.')).toBe(true)
    expect(speakCoach('Leave the switch open.')).toBe(true)
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
    expect(speakCoach('A different line.')).toBe(true)
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    expect(latestCoachStatement()).toBe('A different line.')
  })

  it('notifies listeners when speech finishes and ignores cancelled utterances', () => {
    const utterances: { onend: (() => void) | null; text: string }[] = []
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [],
    })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        text: string
        constructor(text: string) {
          this.text = text
          utterances.push(this)
        }
      },
    )
    const finished = vi.fn()
    const unsubscribe = subscribeCoachSpeechFinished(finished)

    speakCoach('First message')
    speakCoach('Second message')
    utterances[0]?.onend?.()
    expect(finished).not.toHaveBeenCalled()
    utterances[1]?.onend?.()
    expect(finished).toHaveBeenCalledTimes(1)

    unsubscribe()
    speakCoach('No listener')
    utterances[2]?.onend?.()
    expect(finished).toHaveBeenCalledTimes(1)
  })

  it('delivers speech completion when the conversation UI mounts afterward', async () => {
    const utterances: { onend: (() => void) | null }[] = []
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [],
    })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor() {
          utterances.push(this)
        }
      },
    )
    speakCoach('The opening question')
    utterances[0]?.onend?.()
    const finished = vi.fn()
    const unsubscribe = subscribeCoachSpeechFinished(finished)
    await Promise.resolve()
    expect(finished).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('reports unavailable browser speech APIs without throwing', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    expect(speakCoach('Hello')).toBe(false)
    expect(repeatCoach()).toBe(false)
    expect(() => stopCoach()).not.toThrow()
  })
})
