import { describe, expect, it } from 'vitest'
import { cleanTranscriptForDisplay } from './displayTranscript'

describe('display transcript cleanup', () => {
  it('removes fillers and collapses an immediate repeated phrase', () => {
    const raw = 'Um, I think, uh, if the if the bulb will light.'

    expect(cleanTranscriptForDisplay(raw)).toBe('I think, if the bulb will light.')
    expect(raw).toBe('Um, I think, uh, if the if the bulb will light.')
  })

  it('handles repeated single words and leaves ordinary text intact', () => {
    expect(cleanTranscriptForDisplay('No, no, the bulb is dark.')).toBe('No, the bulb is dark.')
    expect(cleanTranscriptForDisplay('The bulb is dark.')).toBe('The bulb is dark.')
  })

  it('does not remove filler-like substrings from other words', () => {
    expect(cleanTranscriptForDisplay('The number is 1.')).toBe('The number is 1.')
    expect(cleanTranscriptForDisplay('This is a human explanation.')).toBe(
      'This is a human explanation.',
    )
  })
})
