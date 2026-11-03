import { describe, expect, it } from 'vitest'
import { latchedExplosion, validateBatteryVolts } from './bench'

describe('validateBatteryVolts', () => {
  it('accepts positive finite voltages', () => {
    expect(validateBatteryVolts('6')).toEqual({ ok: true, value: 6 })
    expect(validateBatteryVolts(' 12.5 ')).toEqual({ ok: true, value: 12.5 })
  })

  it('rejects empty, zero, negative, and non-finite input', () => {
    expect(validateBatteryVolts('').ok).toBe(false)
    expect(validateBatteryVolts('   ').ok).toBe(false)
    expect(validateBatteryVolts('0').ok).toBe(false)
    expect(validateBatteryVolts('-6').ok).toBe(false)
    expect(validateBatteryVolts('NaN').ok).toBe(false)
    expect(validateBatteryVolts('Infinity').ok).toBe(false)
    expect(validateBatteryVolts('six').ok).toBe(false)
  })
})

describe('latchedExplosion', () => {
  it('latches exploded bulbs; overworked ones recover', () => {
    expect(latchedExplosion({ L1: 'overworked', L2: 'intact', L3: 'exploded' })).toEqual({
      L3: 'exploded',
    })
  })

  it('returns an empty latch for intact or missing conditions', () => {
    expect(latchedExplosion({ L1: 'intact' })).toEqual({})
    expect(latchedExplosion({})).toEqual({})
    expect(latchedExplosion(undefined)).toEqual({})
  })
})
