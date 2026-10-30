import { describe, expect, it } from 'vitest'
import { latchedDamage, validateBatteryVolts } from './bench'

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

describe('latchedDamage', () => {
  it('latches overloaded and damaged bulbs, nothing else', () => {
    expect(latchedDamage({ L1: 'overloaded', L2: 'intact', L3: 'damaged' })).toEqual({
      L1: 'damaged',
      L3: 'damaged',
    })
  })

  it('returns an empty latch for intact or missing conditions', () => {
    expect(latchedDamage({ L1: 'intact' })).toEqual({})
    expect(latchedDamage({})).toEqual({})
    expect(latchedDamage(undefined)).toEqual({})
  })
})
