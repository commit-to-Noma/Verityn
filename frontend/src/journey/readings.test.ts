import { describe, expect, it } from 'vitest'
import { batterySupplyLine } from './readings'

describe('battery journey readings', () => {
  it('describes source current and power as supplied magnitudes', () => {
    expect(batterySupplyLine(6, -0.6, -3.6)).toBe(
      'Battery supplies 0.6 A (3.6 W) at 6 V.',
    )
  })

  it('rounds floating point solver values for display', () => {
    expect(batterySupplyLine(5.999999999, -0.6000000001, -3.5999999999)).toBe(
      'Battery supplies 0.6 A (3.6 W) at 6 V.',
    )
  })
})
