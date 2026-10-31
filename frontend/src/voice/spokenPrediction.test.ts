import { describe, expect, it } from 'vitest'
import { spokenPredictionChoice, transcriptFill } from './spokenPrediction'

describe('spokenPredictionChoice', () => {
  it.each([
    ['Yes, the bulb will light.', 'yes'],
    ['I think it should light up', 'yes'],
    ['The bulb will not light', 'no'],
    ['No, it will stay dark', 'no'],
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
  it('fills why and pre-selects a clear yes', () => {
    const fill = transcriptFill('Yes, the bulb will light.')
    expect(fill.why).toBe('Yes, the bulb will light.')
    expect(fill.choice).toBe('yes')
    expect(fill.status).toContain('Selected Yes')
  })

  it('fills why and pre-selects no without committing', () => {
    const fill = transcriptFill('No, it will stay dark')
    expect(fill.why).toBe('No, it will stay dark')
    expect(fill.choice).toBe('no')
    expect(fill.status).toContain('press Continue')
  })

  it('fills why but selects nothing ambiguous', () => {
    const fill = transcriptFill('cupcake poop')
    expect(fill.why).toBe('cupcake poop')
    expect(fill.choice).toBeNull()
    expect(fill.status).toContain('Choose Yes, No, or Not sure')
  })

  it('truncates long transcripts to the field limit', () => {
    const fill = transcriptFill(`${'word '.repeat(40)}yes`)
    expect(fill.why.length).toBe(140)
  })
})
