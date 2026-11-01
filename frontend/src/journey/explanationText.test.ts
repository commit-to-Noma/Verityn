import { describe, expect, it } from 'vitest'
import { isDeclarativeExplanation } from './explanationText'

describe('isDeclarativeExplanation', () => {
  it('keeps declarative explanations', () => {
    expect(isDeclarativeExplanation('The open switch breaks the loop.')).toBe(true)
  })

  it('rejects explanations that end with an unanswered question', () => {
    expect(isDeclarativeExplanation('Why does the current stop?')).toBe(false)
    expect(isDeclarativeExplanation('What happens next？ ')).toBe(false)
    expect(isDeclarativeExplanation('“Will it light?”')).toBe(false)
  })
})
