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
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.6, outcome: 'BULB LIT', lit: true, strain: false, dim: false, standoff: false })
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
    expect(model).toEqual({ state: 'LOOP OPEN', amps: 0, outcome: 'BULB DARK', lit: false, strain: false, dim: false, standoff: false })
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
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.6, outcome: '2 BULBS LIT', lit: true, strain: false, dim: false, standoff: false })
  })

  it('handles a solved circuit with no bulbs', () => {
    const model = bannerModel(
      solved({ B1: { voltage: 6, current: 0, power: 0 } }),
      netlist([{ id: 'B1', type: 'battery' }]),
    )
    expect(model).toEqual({ state: 'NO GLOW', amps: 0, outcome: 'NO BULBS', lit: false, strain: false, dim: false, standoff: false })
  })

  it('reports an exploded bulb as exploded, never lit, with zero headline amps', () => {
    const result = solved({ L1: { voltage: 24, current: 2.4, power: 57.6 } })
    result.conditions = { L1: 'exploded' }
    const model = bannerModel(
      result,
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'S1', type: 'switch', closed: true },
        { id: 'L1', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'NO GLOW', amps: 0, outcome: 'BULB EXPLODED', lit: false, strain: false, dim: false, standoff: false })
  })

  it('still celebrates the lit sibling of an exploded bulb', () => {
    const result = solved({
      L1: { voltage: 24, current: 2.4, power: 57.6 },
      L2: { voltage: 6, current: 0.6, power: 3.6 },
    })
    result.conditions = { L1: 'exploded', L2: 'intact' }
    const model = bannerModel(
      result,
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'L1', type: 'bulb' },
        { id: 'L2', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.6, outcome: 'BULB LIT', lit: true, strain: false, dim: false, standoff: false })
  })

  it('names a straining bulb overworked while keeping its flowing amps', () => {
    const result = solved({ L1: { voltage: 18, current: 1.8, power: 32.4 } })
    result.conditions = { L1: 'overworked' }
    const model = bannerModel(
      result,
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'S1', type: 'switch', closed: true },
        { id: 'L1', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 1.8, outcome: 'BULB OVERWORKED', lit: true, strain: true, dim: false, standoff: false })
  })

  it('headlines strain over fine siblings', () => {
    const result = solved({
      L1: { voltage: 18, current: 1.8, power: 32.4 },
      L2: { voltage: 6, current: 0.6, power: 3.6 },
    })
    result.conditions = { L1: 'overworked', L2: 'intact' }
    const model = bannerModel(
      result,
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'L1', type: 'bulb' },
        { id: 'L2', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 1.8, outcome: 'BULB OVERWORKED', lit: true, strain: true, dim: false, standoff: false })
  })

  it('names a starved pair dim instead of lit', () => {
    const model = bannerModel(
      solved({
        L1: { voltage: 3, current: 0.3, power: 0.9 },
        L2: { voltage: 3, current: 0.3, power: 0.9 },
      }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'L1', type: 'bulb' },
        { id: 'L2', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.3, outcome: '2 BULBS DIM', lit: true, strain: false, dim: true, standoff: false })
  })

  it('names one starved bulb dim', () => {
    const model = bannerModel(
      solved({ L1: { voltage: 3, current: 0.3, power: 0.9 } }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'L1', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.3, outcome: 'BULB DIM', lit: true, strain: false, dim: true, standoff: false })
  })

  it('keeps LIT when one sibling burns at full brightness', () => {
    const model = bannerModel(
      solved({
        L1: { voltage: 3, current: 0.3, power: 0.9 },
        L2: { voltage: 6, current: 0.6, power: 3.6 },
      }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'L1', type: 'bulb' },
        { id: 'L2', type: 'bulb' },
      ]),
    )
    expect(model).toEqual({ state: 'CLOSED LOOP', amps: 0.6, outcome: '2 BULBS LIT', lit: true, strain: false, dim: false, standoff: false })
  })

  it('names opposing batteries a standoff instead of no glow', () => {
    const model = bannerModel(
      solved({
        B1: { voltage: 6, current: 0, power: 0 },
        B2: { voltage: 6, current: 0, power: 0 },
        L1: { voltage: 0, current: 0, power: 0 },
      }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'B2', type: 'battery' },
        { id: 'S1', type: 'switch', closed: true },
        { id: 'L1', type: 'bulb' },
      ]),
      true,
    )
    expect(model).toEqual({ state: 'STANDOFF', amps: 0, outcome: 'BULB DARK', lit: false, strain: false, dim: false, standoff: true })
  })

  it('keeps loop open over standoff when the switch is open', () => {
    const model = bannerModel(
      solved({ L1: { voltage: 0, current: 0, power: 0 } }),
      netlist([
        { id: 'B1', type: 'battery' },
        { id: 'B2', type: 'battery' },
        { id: 'S1', type: 'switch', closed: false },
        { id: 'L1', type: 'bulb' },
      ]),
      true,
    )
    expect(model).toEqual({ state: 'LOOP OPEN', amps: 0, outcome: 'BULB DARK', lit: false, strain: false, dim: false, standoff: false })
  })
})
