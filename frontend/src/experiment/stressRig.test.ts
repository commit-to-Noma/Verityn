import { describe, expect, it } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import { describeRun, type RunRecord } from './history'
import { buildSweepPlan, pointState, summarizeSweep, type SweepPoint } from './stressRig'

const LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
    { id: 'L1', type: 'bulb', a: 'p', b: '0' },
  ],
}

function solved(power: number, current: number, condition?: 'intact' | 'overworked' | 'exploded'): SimulateResult {
  return {
    ok: true,
    node_voltages: { p: 6, '0': 0 },
    components: {
      B1: { voltage: 6, current: -current, power: -power },
      L1: { voltage: 6, current, power },
    },
    conditions: condition === undefined ? { L1: 'intact' } : { L1: condition },
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

function point(n: number, setVolts: number, result: SimulateResult): SweepPoint {
  return { setVolts, run: describeRun(n, `Rig B1 ${setVolts} V`, result, LOOP) }
}

describe('buildSweepPlan', () => {
  it('builds an inclusive ladder that lands on the end', () => {
    const plan = buildSweepPlan('B1', '2', '8', '2')
    expect(plan).toEqual({ ok: true, plan: { batteryId: 'B1', points: [2, 4, 6, 8] } })
  })

  it('appends the end point when the step does not land on it', () => {
    const plan = buildSweepPlan('B1', '2', '9', '2')
    expect(plan).toEqual({ ok: true, plan: { batteryId: 'B1', points: [2, 4, 6, 8, 9] } })
  })

  it('accepts a single-point sweep', () => {
    const plan = buildSweepPlan('B1', '6', '6', '2')
    expect(plan).toEqual({ ok: true, plan: { batteryId: 'B1', points: [6] } })
  })

  it('rejects non-numeric and out-of-range ladders', () => {
    expect(buildSweepPlan('B1', '', '8', '2')).toMatchObject({ ok: false })
    expect(buildSweepPlan('B1', '0', '8', '2')).toMatchObject({ ok: false })
    expect(buildSweepPlan('B1', '2', '30', '2')).toMatchObject({ ok: false })
    expect(buildSweepPlan('B1', '8', '2', '2')).toMatchObject({ ok: false })
    expect(buildSweepPlan('B1', '2', '8', '0')).toMatchObject({ ok: false })
  })

  it('caps the ladder at 25 points', () => {
    const plan = buildSweepPlan('B1', '0.1', '24', '0.1')
    expect(plan.ok).toBe(false)
    if (!plan.ok) {
      expect(plan.error).toMatch(/bigger step/)
    }
  })
})

describe('pointState', () => {
  it('reads worst-first across rejected, exploded, overworked, lit, and dark', () => {
    expect(pointState(point(1, 6, REJECTED))).toBe('rejected')
    expect(pointState(point(2, 20, solved(0, 0, 'exploded')))).toBe('exploded')
    expect(pointState(point(3, 14, solved(19.6, 1.4, 'overworked')))).toBe('overworked')
    expect(pointState(point(4, 6, solved(3.6, 0.6, 'intact')))).toBe('lit')
    expect(pointState(point(5, 2, solved(0.4, 0.2, 'intact')))).toBe('dark')
  })

  it('prefers exploded over a lit sibling bulb', () => {
    const twoBulb: Netlist = {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
        { id: 'L1', type: 'bulb', a: 'p', b: '0' },
        { id: 'L2', type: 'bulb', a: 'p', b: '0' },
      ],
    }
    const result = {
      ok: true,
      node_voltages: { p: 6, '0': 0 },
      components: {
        B1: { voltage: 6, current: -0.6, power: -3.6 },
        L1: { voltage: 0, current: 0, power: 0 },
        L2: { voltage: 6, current: 0.6, power: 3.6 },
      },
      conditions: { L1: 'exploded', L2: 'intact' },
      error_code: null,
      error_message: '',
      component_ids: [],
    } as unknown as SimulateResult
    const run: RunRecord = describeRun(6, 'Rig', result, twoBulb)
    expect(pointState({ setVolts: 6, run })).toBe('exploded')
  })
})

describe('summarizeSweep', () => {
  it('names first glow, overwork, and the blow point with run numbers', () => {
    const points = [
      point(1, 2, solved(0.4, 0.2, 'intact')),
      point(2, 6, solved(3.6, 0.6, 'intact')),
      point(3, 14, solved(19.6, 1.4, 'overworked')),
      point(4, 20, solved(0, 0, 'exploded')),
      point(5, 22, solved(0, 0, 'exploded')),
    ]
    expect(summarizeSweep(points)).toEqual([
      'First glow at 6 V (run 2).',
      'Overworked from 14 V (run 3).',
      'Blew at 20 V (run 4) — later points stay dark until the bench resets.',
    ])
  })

  it('says plainly when nothing glowed', () => {
    expect(summarizeSweep([point(1, 2, solved(0.4, 0.2, 'intact'))])).toEqual([
      'No glow across this sweep — every point stayed dark.',
    ])
  })

  it('covers benches without bulbs and empty sweeps', () => {
    const noBulb: Netlist = {
      components: [{ id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' }],
    }
    const result = {
      ok: true,
      node_voltages: { p: 6, '0': 0 },
      components: { B1: { voltage: 6, current: 0, power: 0 } },
      error_code: null,
      error_message: '',
      component_ids: [],
    } as unknown as SimulateResult
    expect(
      summarizeSweep([{ setVolts: 6, run: describeRun(1, 'Rig', result, noBulb) }]),
    ).toEqual(['No bulbs on the bench — the sweep measured current only.'])
    expect(summarizeSweep([])).toEqual([])
  })
})
