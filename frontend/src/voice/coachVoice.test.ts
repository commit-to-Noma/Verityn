import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  latestCoachStatement,
  latestCoachMessage,
  chooseCoachVoice,
  repeatCoach,
  speakCoach,
  stopCoach,
  subscribeCoachSpeechFinished,
  subscribeCoachStatement,
} from './coachVoice'

afterEach(() => {
  vi.useRealTimers()
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
    const statements: { text: string; provider: string | null }[] = []
    const unsubscribeStatement = subscribeCoachStatement((statement) => statements.push(statement))

    expect(speakCoach('Connect the open ends.', { provider: 'meta-spark' })).toBe(true)
    expect(statements).toEqual([{ text: 'Connect the open ends.', provider: 'meta-spark' }])
    expect(synthesis.cancel).toHaveBeenCalledTimes(1)
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
    expect(utterances[0]).toMatchObject({ text: 'Connect the open ends.', rate: 0.95, pitch: 1.04 })
    expect(latestCoachStatement()).toBe('Connect the open ends.')
    expect(latestCoachMessage()).toEqual({
      text: 'Connect the open ends.',
      provider: 'meta-spark',
    })
    stopCoach()
    expect(synthesis.cancel).toHaveBeenCalledTimes(2)
    expect(repeatCoach()).toBe(true)
    expect(synthesis.cancel).toHaveBeenCalledTimes(3)
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    expect(utterances[1]?.text).toBe('Connect the open ends.')
    unsubscribeStatement()
  })

  it('ranks preferred English browser voices ahead of ordinary voices', () => {
    const voices = [
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Enhanced English', lang: 'en-GB' },
      { name: 'Natural Voice', lang: 'en-US' },
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Neural English', lang: 'en-US' },
      { name: 'Premium Voice', lang: 'en-US' },
      { name: 'Google Spanish', lang: 'es-ES' },
    ]

    expect(chooseCoachVoice(voices)).toBe(voices[5])
    expect(chooseCoachVoice([{ name: 'Spanish', lang: 'es-ES' }])).toBeNull()
  })

  it('adds a short pause between sentences without changing their words', () => {
    vi.useFakeTimers()
    const utterances: { text: string; onend: (() => void) | null }[] = []
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
        rate = 1
        pitch = 1
        voice: SpeechSynthesisVoice | null = null
        constructor(text: string) {
          this.text = text
          utterances.push(this)
        }
      },
    )

    speakCoach('Connect the ends. Then test the bulb.')
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      'Connect the ends.',
    ])
    utterances[0]?.onend?.()
    vi.advanceTimersByTime(179)
    expect(utterances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      'Connect the ends.',
      'Then test the bulb.',
    ])
  })

  it('reads the whole line even when the browser drops sentence-end events', () => {
    vi.useFakeTimers()
    const utterances: { text: string }[] = []
    const finished = vi.fn()
    const unsubscribe = subscribeCoachSpeechFinished(finished)
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      resume: vi.fn(),
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

    // Neither onend nor onerror ever fires: the watchdog must advance anyway.
    speakCoach('With the switch open, no current flows. The bulb stays off.')
    expect(utterances).toHaveLength(1)
    vi.advanceTimersByTime(60_000)
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      'With the switch open, no current flows.',
      'The bulb stays off.',
    ])
    expect(finished).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('does not lose provider metadata when the current line is replayed', () => {
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [],
    })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(_text: string) {}
      },
    )
    speakCoach('A Spark reply.', { provider: 'meta-spark' })
    expect(repeatCoach()).toBe(true)
    expect(latestCoachMessage()).toEqual({
      text: 'A Spark reply.',
      provider: 'meta-spark',
    })
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

  it('keeps the welcome line to one utterance and ignores duplicate strict-mode calls', () => {
    const utterances: { text: string }[] = []
    const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] }
    vi.stubGlobal('speechSynthesis', synthesis)
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string
        constructor(text: string) {
          this.text = text
          utterances.push(this)
        }
      },
    )
    const welcome =
      'Welcome to the Guided Lab. This bulb is off because the circuit has a gap. Will it light once the loose ends are connected?'

    speakCoach(welcome, { singleUtterance: true })
    speakCoach(welcome, { singleUtterance: true })

    expect(utterances.map((utterance) => utterance.text)).toEqual([welcome])
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
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
