import { describe, expect, it } from 'vitest'
import { flowForCurrent, glowIntensity } from './visuals'

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
