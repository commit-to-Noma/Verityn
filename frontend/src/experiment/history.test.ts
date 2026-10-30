import { describe, expect, it } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import { compareRuns, describeRun, summarizeRun } from './history'

const LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
    { id: 'L1', type: 'bulb', a: 'p', b: '0' },
  ],
}

function solved(power: number, current: number): SimulateResult {
  return {
    ok: true,
    components: {
      B1: { voltage: 6, current: -current, power: -power },
      L1: { voltage: 6, current, power },
    },
    error_code: null,
    error_message: '',
    component_ids: [],
  } as unknown as SimulateResult
}

const REJECTED: SimulateResult = {
  ok: false,
  components: {},
  error_code: 'SHORTED_BATTERY',
  error_message: 'shorted',
  component_ids: ['B1'],
} as unknown as SimulateResult

describe('describeRun', () => {
  it('records lit runs with headline current', () => {
    const record = describeRun(1, 'Light a bulb', solved(3.6, 0.6), LOOP)
    expect(record).toMatchObject({ n: 1, valid: true, amps: 0.6, bulbsLit: 1, bulbCount: 1, errorCode: null })
  })

  it('records dark runs as valid with zero lit', () => {
    const record = describeRun(2, 'Open the switch', solved(0, 0), LOOP)
    expect(record).toMatchObject({ valid: true, amps: 0, bulbsLit: 0 })
  })

  it('records rejections with their solver code and no invented numbers', () => {
    const record = describeRun(3, 'Shorted battery', REJECTED, LOOP)
    expect(record).toMatchObject({ valid: false, amps: 0, bulbsLit: 0, errorCode: 'SHORTED_BATTERY' })
  })
})

describe('summarizeRun', () => {
  it('renders the one-line run format', () => {
    expect(summarizeRun(describeRun(3, 'Switch opened', solved(0, 0), LOOP))).toBe(
      'Run 3 — Switch opened — 0.0 A — bulb dark',
    )
    expect(summarizeRun(describeRun(1, 'Light a bulb', solved(3.6, 0.6), LOOP))).toBe(
      'Run 1 — Light a bulb — 0.6 A — 1 bulb lit',
    )
  })

  it('renders rejections honestly', () => {
    expect(summarizeRun(describeRun(2, 'Shorted battery', REJECTED, LOOP))).toBe(
      'Run 2 — Shorted battery — not testable (SHORTED_BATTERY)',
    )
  })
})

describe('compareRuns', () => {
  it('returns null for the first run', () => {
    expect(compareRuns(null, describeRun(1, 'x', solved(3.6, 0.6), LOOP))).toBeNull()
  })

  it('compares current and lit counts across valid runs', () => {
    const prev = describeRun(1, 'Light a bulb', solved(3.6, 0.6), LOOP)
    const curr = describeRun(2, 'Switch opened', solved(0, 0), LOOP)
    expect(compareRuns(prev, curr)).toBe('Compared with run 1: less current (0.6 A → 0.0 A), 1 → 0 bulbs lit.')
  })

  it('handles rejection transitions without inventing a comparison', () => {
    const good = describeRun(1, 'Light a bulb', solved(3.6, 0.6), LOOP)
    const bad = describeRun(2, 'Shorted battery', REJECTED, LOOP)
    expect(compareRuns(good, bad)).toContain('rejected')
    expect(compareRuns(bad, good)).toContain('tested after the last rejection')
    expect(compareRuns(bad, bad)).toContain('Both runs were rejected')
  })
})
