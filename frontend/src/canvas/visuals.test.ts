import { describe, expect, it } from 'vitest'
import {
  flowDurationForCurrent,
  flowForCurrent,
  glowIntensity,
  shouldBurstGlow,
} from './visuals'

describe('glowIntensity', () => {
  it.each([
    [0, 0],
    [-3.6, 0],
    [1e-9, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [0.9, 0.25],
    [3.6, 1],
    [14.4, 1],
  ])('maps %s W to glow %s', (power, expected) => {
    expect(glowIntensity(power)).toBeCloseTo(expected, 10)
  })

  describe('shouldBurstGlow', () => {
    it('bursts only when a solver reading changes a dark bulb to lit', () => {
      expect(shouldBurstGlow(0, 3.6)).toBe(true)
      expect(shouldBurstGlow(0.5, 3.6)).toBe(false)
      expect(shouldBurstGlow(0, 0)).toBe(false)
    })
  })
})

describe('flowForCurrent', () => {
  it.each([
    [0.6, 'forward'],
    [1e-9 + 1e-12, 'forward'],
    [-0.6, 'reverse'],
    [0, 'still'],
    [1e-12, 'still'],
    [-1e-12, 'still'],
    [Number.NaN, 'still'],
  ] as const)('maps %s A to %s', (current, expected) => {
    expect(flowForCurrent(current)).toBe(expected)
  })
})

describe('flowDurationForCurrent', () => {
  it.each([
    [0.6, 0.5],
    [-0.6, 0.5],
    [1.2, 0.25],
    [0.3, 1],
    [3, 0.15],
    [30, 0.15],
    [0.06, 2],
    [0.006, 2],
  ])('maps %s A to a %s s dash cycle', (current, expected) => {
    expect(flowDurationForCurrent(current)).toBeCloseTo(expected, 10)
  })

  it.each([[0], [1e-12], [-1e-12], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'stays still for %s A',
    (current) => {
      expect(flowDurationForCurrent(current)).toBeNull()
    },
  )
})
