import { describe, expect, it } from 'vitest'
import { finaleRevealDelay } from './finaleMotion'

describe('Finale reveal order', () => {
  it('staggers saved chapters in their displayed order', () => {
    expect([0, 1, 2].map(finaleRevealDelay)).toEqual(['0ms', '260ms', '520ms'])
  })

  it('does not delay an invalid negative chapter index', () => {
    expect(finaleRevealDelay(-1)).toBe('0ms')
  })
})
