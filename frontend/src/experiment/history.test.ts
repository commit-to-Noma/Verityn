import { describe, expect, it } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import { batteriesOppose, compareRuns, describeRun, diagnoseRun, friendlyErrorCode, hudReading, summarizeRun } from './history'

const LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
    { id: 'L1', type: 'bulb', a: 'p', b: '0' },
  ],
}

function solved(power: number, current: number): SimulateResult {
  return {
    ok: true,
    node_voltages: { p: 6, '0': 0 },
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

  it('records exploded runs as dark with zero headline amps despite the surge', () => {
    const record = describeRun(
      4,
      'Time Bomb',
      { ...solved(57.6, 2.4), conditions: { L1: 'exploded' } } as unknown as SimulateResult,
      LOOP,
    )
    expect(record).toMatchObject({ valid: true, amps: 0, bulbsLit: 0 })
  })

  it('records rejections with their solver code and no invented numbers', () => {
    const record = describeRun(3, 'Shorted battery', REJECTED, LOOP)
    expect(record).toMatchObject({ valid: false, amps: 0, bulbsLit: 0, errorCode: 'SHORTED_BATTERY' })
  })

  it('records per-bulb conditions and solver-measured source volts', () => {
    const result = {
      ...solved(14.4, 1.2),
      conditions: { L1: 'overworked' },
    } as unknown as SimulateResult
    const record = describeRun(2, 'Overload the bulb', result, LOOP)
    expect(record.bulbs).toEqual([
      { id: 'L1', volts: 6, amps: 1.2, watts: 14.4, condition: 'overworked' },
    ])
    expect(record.sourceVolts).toBe(6)
  })

  it('tolerates results without conditions or ratings', () => {
    const record = describeRun(1, 'Light a bulb', solved(3.6, 0.6), LOOP)
    expect(record.bulbs).toEqual([
      { id: 'L1', volts: 6, amps: 0.6, watts: 3.6, condition: null },
    ])
  })
})

describe('diagnoseRun', () => {
  function overloaded(): SimulateResult {
    return {
      ...solved(14.4, 1.2),
      conditions: { L1: 'overworked' },
      ratings: { L1: { rated_volts: 6, max_safe_watts: 6 } },
    } as unknown as SimulateResult
  }

  it('stays silent for healthy runs', () => {
    expect(diagnoseRun(solved(3.6, 0.6), LOOP, null)).toEqual([])
  })

  it('names the overloaded bulb with its measured numbers', () => {
    expect(diagnoseRun(overloaded(), LOOP, null)).toEqual([
      'Light 1 took 14.4 W against a 6.0 W safe limit (6.0 V, 1.2 A). ' +
        'Lower a battery voltage or add another bulb to share the load.',
    ])
  })

  it('cites the previous run when a bulb explodes', () => {
    const damaged = {
      ...solved(0, 0),
      conditions: { L1: 'exploded' },
      ratings: { L1: { rated_volts: 6, max_safe_watts: 6 } },
    } as unknown as SimulateResult
    const before = describeRun(5, 'Overload the bulb', overloaded(), LOOP)
    expect(diagnoseRun(damaged, LOOP, before)).toEqual([
      'Light 1 exploded and passes no current. Run 5 pushed it to 14.4 W. Reset the bench to restore it.',
    ])
  })

  it('falls back to the limit when no previous run exists', () => {
    const damaged = {
      ...solved(0, 0),
      conditions: { L1: 'exploded' },
      ratings: { L1: { rated_volts: 6, max_safe_watts: 6 } },
    } as unknown as SimulateResult
    expect(diagnoseRun(damaged, LOOP, null)).toEqual([
      'Light 1 exploded and passes no current. It blew past its 6.0 W limit. Reset the bench to restore it.',
    ])
  })
})

describe('summarizeRun', () => {
  it('renders the one-line run format', () => {
    expect(summarizeRun(describeRun(3, 'Switch opened', solved(0, 0), LOOP))).toBe(
      'Run 3  -  Switch opened  -  6.0 V net source  -  0.0 A',
    )
    expect(summarizeRun(describeRun(1, 'Light a bulb', solved(3.6, 0.6), LOOP))).toBe(
      'Run 1  -  Light a bulb  -  6.0 V net source  -  0.6 A',
    )
  })

  it('renders rejections honestly', () => {
    expect(summarizeRun(describeRun(2, 'Shorted battery', REJECTED, LOOP))).toBe(
      'Run 2  -  Shorted battery  -  not testable (Short circuit)',
    )
  })

  it('names overworked and exploded bulbs', () => {
    const overloaded = describeRun(
      2,
      'Overload the bulb',
      { ...solved(14.4, 1.2), conditions: { L1: 'overworked' } } as unknown as SimulateResult,
      LOOP,
    )
    expect(summarizeRun(overloaded)).toBe(
      'Run 2  -  Overload the bulb  -  6.0 V net source  -  1.2 A  -  Light 1 overworked',
    )
    const damaged = describeRun(
      3,
      'Overload the bulb',
      { ...solved(0, 0), conditions: { L1: 'exploded' } } as unknown as SimulateResult,
      LOOP,
    )
    expect(summarizeRun(damaged)).toBe(
      'Run 3  -  Overload the bulb  -  6.0 V net source  -  0.0 A  -  Light 1 exploded',
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

  it('reports battery and bulb-power changes from the two real runs', () => {
    const single: Netlist = {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
        { id: 'L1', type: 'bulb', a: 'p', b: '0' },
      ],
    }
    const doubled: Netlist = {
      components: [
        { id: 'B1', type: 'battery', volts: 12, a: 'p', b: '0' },
        { id: 'L1', type: 'bulb', a: 'p', b: '0' },
      ],
    }
    const prev = describeRun(1, 'Overload the bulb', solved(3.6, 0.6), single)
    const curr = describeRun(
      2,
      'Overload the bulb',
      { ...solved(14.4, 1.2), conditions: { L1: 'overworked' } } as unknown as SimulateResult,
      doubled,
    )
    expect(compareRuns(prev, curr)).toBe(
      'Compared with run 1: more current (0.6 A → 1.2 A), ' +
        'Light 1 power 3.6 W → 14.4 W (4.0×).',
    )
  })

  it('records solver-derived net source voltage when batteries oppose', () => {
    const nine: Netlist = {
      components: [...Array.from({ length: 9 }, (_, index) => ({
        id: `B${index + 1}`,
        type: 'battery' as const,
        volts: 24,
        a: index < 5 ? `n${index + 1}` : `n${index}`,
        b: index < 5 ? `n${index}` : `n${index + 1}`,
      })), { id: 'L1', type: 'bulb', a: 'n9', b: 'n0' }],
    }
    const result = {
      ...solved(57.599999999999994, 2.4),
      node_voltages: { n0: 0, n9: 24 },
      components: {
        ...solved(57.6, 2.4).components,
        ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
          `B${index + 1}`,
          { voltage: 24, current: index < 5 ? -2.4 : 2.4, power: 0 },
        ])),
        L1: { voltage: 24, current: 2.4, power: 57.599999999999994 },
      },
    } as unknown as SimulateResult
    expect(describeRun(1, 'Nine batteries', result, nine).sourceVolts).toBeCloseTo(24)
    expect(batteriesOppose(result, nine)).toBe(true)
  })

  it('detects opposing batteries when their net voltage and current are both zero', () => {
    const opposing: Netlist = {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'n1', b: 'n0' },
        { id: 'B2', type: 'battery', volts: 6, a: 'n1', b: 'n2' },
        { id: 'L1', type: 'bulb', a: 'n2', b: 'n0' },
      ],
    }
    const result = {
      ...solved(0, 0),
      components: {
        B1: { voltage: 6, current: 0, power: 0 },
        B2: { voltage: 6, current: 0, power: 0 },
        L1: { voltage: 0, current: 0, power: 0 },
      },
      conditions: { L1: 'intact' },
    } as unknown as SimulateResult
    expect(batteriesOppose(result, opposing)).toBe(true)
  })

  it('leaves ordinary comparisons unchanged when nothing eventful happened', () => {
    const prev = describeRun(1, 'Light a bulb', solved(3.6, 0.6), LOOP)
    const curr = describeRun(2, 'Free build', solved(3.6, 0.6), LOOP)
    expect(compareRuns(prev, curr)).toBe('Compared with run 1: about the same current.')
  })
})

describe('hudReading', () => {
  it('reads net source volts, headline amps, and the lit word', () => {
    expect(hudReading(solved(3.6, 0.6), LOOP)).toEqual({ sourceVolts: 6, amps: 0.6, lit: true })
  })

  it('reads dark runs with zero amps', () => {
    const dark = {
      ...solved(0, 0),
      components: {
        B1: { voltage: 6, current: 0, power: 0 },
        L1: { voltage: 0, current: 0, power: 0 },
      },
    } as unknown as SimulateResult
    expect(hudReading(dark, LOOP)).toEqual({ sourceVolts: 0, amps: 0, lit: false })
  })

  it('returns null for rejections', () => {
    expect(hudReading(REJECTED, LOOP)).toBeNull()
  })
})

describe('friendlyErrorCode', () => {
  it('maps known solver codes to plain words', () => {
    expect(friendlyErrorCode('DANGLING_TERMINAL')).toBe('Loose wire')
    expect(friendlyErrorCode('SHORTED_BATTERY')).toBe('Short circuit')
    expect(friendlyErrorCode('CONFLICTING_SOURCES')).toBe('Conflicting batteries')
    expect(friendlyErrorCode('NO_PATH')).toBe('Incomplete loop')
  })

  it('humanizes unknown codes and blanks', () => {
    expect(friendlyErrorCode('SOME_NEW_FAULT')).toBe('Some New Fault')
    expect(friendlyErrorCode(null)).toBe('Rejected')
    expect(friendlyErrorCode('')).toBe('Rejected')
  })
})

describe('diagnoseRun rejections', () => {
  it('names the loose part for dangling terminals', () => {
    const dangling = {
      ...REJECTED,
      error_code: 'DANGLING_TERMINAL',
      component_ids: ['L1'],
    } as unknown as SimulateResult
    expect(diagnoseRun(dangling, LOOP, null)).toEqual([
      'Loose wire: Light 1 has a loose end, so the loop is incomplete. Connect every open terminal and run again.',
    ])
  })

  it('names the shorted battery', () => {
    expect(diagnoseRun(REJECTED, LOOP, null)).toEqual([
      'Short circuit: a wire connects Battery 1 straight back to itself. Give the current a path through a bulb instead.',
    ])
  })
})
