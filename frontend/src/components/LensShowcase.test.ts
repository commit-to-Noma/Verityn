import { describe, expect, it } from 'vitest'
import { stepSpin, stepSpring } from './LensShowcase'

const DT = 1 / 60

describe('stepSpring', () => {
  it('settles on the target', () => {
    let value = 14
    let velocity = 0
    for (let i = 0; i < 600; i += 1) {
      ;({ value, velocity } = stepSpring(value, velocity, 0, 120, 9, DT))
    }
    expect(value).toBeCloseTo(0, 2)
    expect(Math.abs(velocity)).toBeLessThan(0.05)
  })

  it('wobbles past the target before settling', () => {
    let value = 14
    let velocity = 0
    let min = value
    for (let i = 0; i < 600; i += 1) {
      ;({ value, velocity } = stepSpring(value, velocity, 0, 120, 9, DT))
      min = Math.min(min, value)
    }
    expect(min).toBeLessThan(0)
  })

  it('ignores non-positive steps', () => {
    expect(stepSpring(3, 9, 0, 120, 9, 0)).toEqual({ value: 3, velocity: 9 })
    expect(stepSpring(3, 9, 0, 120, 9, -1)).toEqual({ value: 3, velocity: 9 })
  })
})

describe('stepSpin', () => {
  it('decays the spin while keeping its direction', () => {
    const first = stepSpin(0, 360, 2.2, DT)
    expect(first.angle).toBeGreaterThan(0)
    expect(first.velocity).toBeGreaterThan(0)
    expect(first.velocity).toBeLessThan(360)
    let { angle, velocity } = first
    for (let i = 0; i < 600; i += 1) {
      ;({ angle, velocity } = stepSpin(angle, velocity, 2.2, DT))
    }
    expect(velocity).toBeLessThan(1)
    expect(angle).toBeGreaterThan(first.angle)
  })

  it('spins freely without friction', () => {
    expect(stepSpin(10, 100, 0, 0.5)).toEqual({ angle: 60, velocity: 100 })
  })

  it('ignores non-positive steps', () => {
    expect(stepSpin(10, 100, 2.2, 0)).toEqual({ angle: 10, velocity: 100 })
  })
})
