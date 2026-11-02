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

  it('collapses repeated phrases across punctuation', () => {
    expect(cleanTranscriptForDisplay('It will light. will light, I think.')).toBe(
      'It will light. I think.',
    )
    expect(cleanTranscriptForDisplay('The the bulb is dark.')).toBe('The bulb is dark.')
    expect(cleanTranscriptForDisplay('if the if the loop is closed')).toBe('If the loop is closed')
  })

  it('strips an echoed question prefix when the prompt is read aloud', () => {
    const question = 'Will the bulb light?'
    expect(cleanTranscriptForDisplay('Will the bulb light? Yes, it will.', question)).toBe(
      'Yes, it will.',
    )
    expect(
      cleanTranscriptForDisplay('Um, will the bulb light, um, no it stays dark.', question),
    ).toBe('No it stays dark.')
  })

  it('keeps spontaneous answers that merely resemble the prompt', () => {
    const question = 'Will the bulb light?'
    expect(cleanTranscriptForDisplay('The bulb will light, I think.', question)).toBe(
      'The bulb will light, I think.',
    )
    expect(cleanTranscriptForDisplay('It will, I think.', question)).toBe('It will, I think.')
  })

  it('reduces filler-only transcripts to an empty string', () => {
    expect(cleanTranscriptForDisplay('Um, uh, erm.')).toBe('')
  })
})
