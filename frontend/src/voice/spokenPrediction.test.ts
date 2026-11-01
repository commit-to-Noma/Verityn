import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PREDICTION_CLARIFICATION_PROMPT,
  scheduleVoiceLock,
  spokenPredictionChoice,
  transcriptFill,
  VOICE_LOCK_MS,
} from './spokenPrediction'

describe('spokenPredictionChoice', () => {
  it.each([
    ['Yes, the bulb will light.', 'yes'],
    ['I think it should light up', 'yes'],
    ['The bulb will not light', 'no'],
    ['No, it will stay dark', 'no'],
    ["The second bulb won't light", 'no'],
    ["I'm not sure if the bulb works", 'not_sure'],
    ["I don't know", 'not_sure'],
  ] as const)('matches "%s"', (text, choice) => {
    expect(spokenPredictionChoice(text)).toBe(choice)
  })

  it('leaves unrelated or ambiguous speech for a conversational reply', () => {
    expect(spokenPredictionChoice('cupcake poop')).toBeNull()
    expect(spokenPredictionChoice('Maybe it lights, maybe not')).toBe('not_sure')
  })
})

describe('transcriptFill', () => {
  it('fills why and pre-selects a clear yes for the lock-in window', () => {
    const fill = transcriptFill('Yes, the bulb will light.')
    expect(fill.why).toBe('Yes, the bulb will light.')
    expect(fill.choice).toBe('yes')
  })

  it('fills why and pre-selects a spoken correction to no', () => {
    const fill = transcriptFill('No, it will stay dark')
    expect(fill.why).toBe('No, it will stay dark')
    expect(fill.choice).toBe('no')
  })

  it('fills why but leaves an ambiguous transcript unselected', () => {
    const fill = transcriptFill('cupcake poop')
    expect(fill.why).toBe('cupcake poop')
    expect(fill.choice).toBeNull()
    expect(PREDICTION_CLARIFICATION_PROMPT).toBe(
      'Do you think the bulb will light: yes, no or not sure?',
    )
  })

  it('truncates long transcripts to the field limit', () => {
    const fill = transcriptFill(`${'word '.repeat(40)}yes`)
    expect(fill.why.length).toBe(140)
  })
})

describe('scheduleVoiceLock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('locks a clear choice after three seconds', () => {
    vi.useFakeTimers()
    const lock = vi.fn()
    scheduleVoiceLock(lock)

    vi.advanceTimersByTime(VOICE_LOCK_MS - 1)
    expect(lock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(lock).toHaveBeenCalledOnce()
  })

  it('cancels the lock during the undo window', () => {
    vi.useFakeTimers()
    const lock = vi.fn()
    const undo = scheduleVoiceLock(lock)

    vi.advanceTimersByTime(VOICE_LOCK_MS - 1)
    undo()
    vi.advanceTimersByTime(1)
    expect(lock).not.toHaveBeenCalled()
  })
})
