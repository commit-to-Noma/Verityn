import { describe, expect, it } from 'vitest'
import { readingAtProgress, shouldAnimateReadout } from './readoutAnimation'

describe('solver readout count-up', () => {
  it('starts at zero and eases to the exact solver value', () => {
    expect(readingAtProgress(3.6, 0)).toBe(0)
    expect(readingAtProgress(3.6, 0.5)).toBeGreaterThan(0)
    expect(readingAtProgress(3.6, 0.5)).toBeLessThan(3.6)
    expect(readingAtProgress(3.6, 1)).toBe(3.6)
  })

  it('clamps progress to keep the value within the solver result', () => {
    expect(readingAtProgress(3.6, -1)).toBe(0)
    expect(readingAtProgress(3.6, 2)).toBe(3.6)
  })

  it('skips animation for reduced motion, zero, and non-finite readings', () => {
    expect(shouldAnimateReadout(3.6, true)).toBe(false)
    expect(shouldAnimateReadout(0, false)).toBe(false)
    expect(shouldAnimateReadout(Number.NaN, false)).toBe(false)
    expect(shouldAnimateReadout(3.6, false)).toBe(true)
  })
})
