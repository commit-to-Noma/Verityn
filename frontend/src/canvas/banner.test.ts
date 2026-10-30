import { describe, expect, it } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import { bannerModel } from './banner'

function solved(components: SimulateResult['components']): SimulateResult {
  return {
    ok: true,
    node_voltages: {},
    components,
    error_code: null,
    error_message: '',
    component_ids: [],
    conditions: {},
    ratings: {},
  }
}

function netlist(
  parts: { id: string; type: 'battery' | 'bulb' | 'switch' | 'wire'; closed?: boolean }[],
): Netlist {
  return {
    components: parts.map((part) => ({ ...part, a: 'x', b: 'y' })),
  }
}

describe('bannerModel', () => {
  it('returns null for an unsolved circuit', () => {
    const result = solved({});
    result.ok = false;
    expect(bannerModel(result, netlist([]))).toBeNull()
  })

  it('models the L1 closed loop', () => {
    const model = bannerModel(
      solved({ L1: { voltage: 6, current: 0.6, power: 3.6 } }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'S1', type: 'switch', closed: true },
        { id: 'L1', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.6, outcome: 'BULB LIT', lit: true })
  })

  it('models the open-switch twist as loop open and dark', () => {
    const model = bannerModel(
      solved({ L1: { voltage: 0, current: 0, power: 0 } }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'S1', type: 'switch', closed: false },
        { id: 'L1', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'LOOP OPEN', amps: 0, outcome: 'BULB DARK', lit: false })
  })

  it('counts both parallel transfer bulbs and takes the largest current', () => {
    const model = bannerModel(
      solved({
        L1: { voltage: 6, current: -0.6, power: 3.6 },
        L2: { voltage: 6, current: 0.6, power: 3.6 },
      }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'L1', type: 'bulb' },
        { id: 'L2', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.6, outcome: '2 BULBS LIT', lit: true })
  })

  it('handles a solved circuit with no bulbs', () => {
    const model = bannerModel(
      solved({ B1: { voltage: 6, current: 0, power: 0 } }),
      netlist([{ id: 'B1', type: 'battery' }]),
    )
    expect(model).toEqual({ state: 'NO GLOW', amps: 0, outcome: 'NO BULBS', lit: false })
  })
})
