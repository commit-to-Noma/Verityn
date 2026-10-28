import { describe, expect, it } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import { lensCulprit } from './culprit'

function netlist(switchClosed: boolean | null): Netlist {
  const components: Netlist['components'] = [
    { id: 'B1', type: 'battery', a: 'p', b: '0', volts: 6 },
    { id: 'L1', type: 'bulb', a: 'm', b: '0' },
  ]
  if (switchClosed !== null) {
    components.splice(1, 0, {
      id: 'S1',
      type: 'switch',
      a: 'p',
      b: 'm',
      closed: switchClosed,
    })
  }
  return { components }
}

function solved(power: number): SimulateResult {
  return {
    ok: true,
    node_voltages: {},
    components: {
      L1: { voltage: 6, current: power === 0 ? 0 : 0.6, power },
    },
    error_code: null,
    error_message: '',
    component_ids: [],
  }
}

describe('lensCulprit', () => {
  it('names the open switch behind a dark contradicted bulb', () => {
    expect(lensCulprit(netlist(false), solved(0), 'CONTRADICTED', 'L1')).toBe('S1')
  })

  it('names nothing when the prediction holds', () => {
    expect(lensCulprit(netlist(false), solved(0), 'CONSISTENT', 'L1')).toBeNull()
  })

  it('names nothing when the bulb is lit', () => {
    expect(lensCulprit(netlist(true), solved(3.6), 'CONTRADICTED', 'L1')).toBeNull()
  })

  it('names nothing without an open switch', () => {
    expect(lensCulprit(netlist(true), solved(0), 'CONTRADICTED', 'L1')).toBeNull()
    expect(lensCulprit(netlist(null), solved(0), 'CONTRADICTED', 'L1')).toBeNull()
  })

  it('names nothing for unsolved or unassessed runs', () => {
    const invalid: SimulateResult = { ...solved(0), ok: false }
    expect(lensCulprit(netlist(false), invalid, 'CONTRADICTED', 'L1')).toBeNull()
    expect(lensCulprit(netlist(false), solved(0), 'UNASSESSABLE', 'L1')).toBeNull()
  })
})
