import { describe, expect, it } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import { describeRun } from './history'
import {
  initialMissionProgress,
  markSweepComplete,
  updateMissionProgress,
} from './missions'

function solved(
  readings: Record<string, { voltage: number; current: number; power: number }>,
  conditions: Record<string, 'intact' | 'overworked' | 'exploded'> = {},
): SimulateResult {
  return {
    ok: true,
    node_voltages: {},
    components: readings,
    conditions,
    error_code: null,
    error_message: '',
    component_ids: [],
  } as unknown as SimulateResult
}

const CLOSED_LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
    { id: 'S1', type: 'switch', closed: true, a: 'p', b: 'q' },
    { id: 'L1', type: 'bulb', a: 'q', b: '0' },
  ],
}

const OPEN_LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
    { id: 'S1', type: 'switch', closed: false, a: 'p', b: 'q' },
    { id: 'L1', type: 'bulb', a: 'q', b: '0' },
  ],
}

const TUG_LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: 'q' },
    { id: 'B2', type: 'battery', volts: 6, a: 'r', b: 'q' },
    { id: 'L1', type: 'bulb', a: 'r', b: 'p' },
  ],
}

const LIT = { B1: { voltage: 6, current: -0.6, power: -3.6 }, L1: { voltage: 6, current: 0.6, power: 3.6 } }
const DARK = { B1: { voltage: 6, current: 0, power: 0 }, L1: { voltage: 0, current: 0, power: 0 } }

describe('updateMissionProgress', () => {
  it('completes first light and loop closer on a closed lit run', () => {
    const result = solved(LIT, { L1: 'intact' })
    const next = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Light a bulb', result, CLOSED_LOOP),
      result,
      CLOSED_LOOP,
    )
    expect(next.done).toContain('first-light')
    expect(next.done).toContain('loop-closer')
    expect(next.done).not.toContain('threshold')
  })

  it('completes threshold and gap finder when a dark open-switch run follows', () => {
    const lit = solved(LIT, { L1: 'intact' })
    const dark = solved(DARK, { L1: 'intact' })
    const afterLit = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Light a bulb', lit, CLOSED_LOOP),
      lit,
      CLOSED_LOOP,
    )
    const afterDark = updateMissionProgress(
      afterLit,
      describeRun(2, 'Open the switch', dark, OPEN_LOOP),
      dark,
      OPEN_LOOP,
    )
    expect(afterDark.done).toContain('threshold')
    expect(afterDark.done).toContain('gap-finder')
  })

  it('does not credit the gap finder when the dark run has no open switch', () => {
    const dark = solved(DARK, { L1: 'intact' })
    const next = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Dim bench', dark, CLOSED_LOOP),
      dark,
      CLOSED_LOOP,
    )
    expect(next.darkSeen).toBe(true)
    expect(next.done).not.toContain('gap-finder')
  })

  it('credits tug of war on series-opposing batteries near 0 V net', () => {
    const result = solved(
            {
        B1: { voltage: 6, current: 0, power: 0 },
        B2: { voltage: 6, current: 0, power: 0 },
        L1: { voltage: 0, current: 0, power: 0 },
      },
      { L1: 'intact' },
    )
    const next = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Tug', result, TUG_LOOP),
      result,
      TUG_LOOP,
    )
    expect(next.done).toContain('tug-of-war')
  })

  it('requires recovery after the redline before completing', () => {
    const hot = solved(
            { B1: { voltage: 14, current: -1.4, power: -19.6 }, L1: { voltage: 14, current: 1.4, power: 19.6 } },
      { L1: 'overworked' },
    )
    const afterHot = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Hot', hot, CLOSED_LOOP),
      hot,
      CLOSED_LOOP,
    )
    expect(afterHot.done).not.toContain('redline')
    const cool = solved(LIT, { L1: 'intact' })
    const afterCool = updateMissionProgress(
      afterHot,
      describeRun(2, 'Cool', cool, CLOSED_LOOP),
      cool,
      CLOSED_LOOP,
    )
    expect(afterCool.done).toContain('redline')
  })

  it('a dark run after the redline does not count as recovery', () => {
    const hot = solved(
            { B1: { voltage: 14, current: -1.4, power: -19.6 }, L1: { voltage: 14, current: 1.4, power: 19.6 } },
      { L1: 'overworked' },
    )
    const afterHot = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Hot', hot, CLOSED_LOOP),
      hot,
      CLOSED_LOOP,
    )
    const dark = solved(DARK, { L1: 'intact' })
    const afterDark = updateMissionProgress(
      afterHot,
      describeRun(2, 'Dark', dark, CLOSED_LOOP),
      dark,
      CLOSED_LOOP,
    )
    expect(afterDark.done).not.toContain('redline')
  })

  it('credits demolition on explosion and ignores rejections', () => {
    const blown = solved({ B1: { voltage: 20, current: 0, power: 0 }, L1: { voltage: 0, current: 0, power: 0 } }, { L1: 'exploded' })
    const next = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Blow', blown, CLOSED_LOOP),
      blown,
      CLOSED_LOOP,
    )
    expect(next.done).toContain('demolition')
    const rejected = { ok: false, components: {}, error_code: 'SHORTED_BATTERY', error_message: '', component_ids: [] } as unknown as SimulateResult
    const afterReject = updateMissionProgress(
      initialMissionProgress(),
      describeRun(1, 'Short', rejected, CLOSED_LOOP),
      rejected,
      CLOSED_LOOP,
    )
    expect(afterReject.done).toEqual([])
  })
})

describe('markSweepComplete', () => {
  it('needs at least 2 points', () => {
    expect(markSweepComplete(initialMissionProgress(), 1).done).not.toContain('full-spectrum')
    expect(markSweepComplete(initialMissionProgress(), 2).done).toContain('full-spectrum')
  })
})
