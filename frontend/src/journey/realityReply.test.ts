import { describe, expect, it } from 'vitest'
import { REALITY_FOLLOWUP_QUESTION, realityReplyFor } from './realityReply'

describe('reality follow-up', () => {
  it('asks one answerable question', () => {
    expect(REALITY_FOLLOWUP_QUESTION).toBe(
      'What would you change to make the bulb light?',
    )
  })

  it.each([
    'close the switch',
    'Close S1',
    'closing the switch completes it',
    'the switch is open',
    'turn it on',
    'switch on',
  ])('confirms a close/switch/on reply: %s', (transcript) => {
    expect(realityReplyFor(transcript)).toBe(
      'Yes. Closing the switch completes the loop.',
    )
  })

  it.each([
    'add another battery',
    'more voltage',
    'I do not know',
    'the button is broken',
  ])('redirects other replies to the gap: %s', (transcript) => {
    expect(realityReplyFor(transcript)).toBe(
      'The open switch is the gap. Another battery adds push but the path ' +
        'is still broken. Try closing S1.',
    )
  })

  it('never reuses the Predict fallback', () => {
    for (const transcript of ['close it', 'no idea', '']) {
      expect(realityReplyFor(transcript)).not.toContain('What do you expect')
    }
  })
})
