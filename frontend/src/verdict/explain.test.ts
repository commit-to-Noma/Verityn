import { describe, expect, test } from 'vitest'
import type { Netlist } from '../api/client'
import { explainLitVerdict } from './explain'

const OPEN_SWITCH: Netlist = {
  components: [
    { id: 'B1', type: 'battery', a: 'p', b: '0', volts: 6 },
    { id: 'S1', type: 'switch', a: 'p', b: 'm', closed: false },
    { id: 'L1', type: 'bulb', a: 'm', b: 'n1' },
    { id: 'W1', type: 'wire', a: 'n1', b: '0' },
  ],
}

const CLOSED_LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', a: 'p', b: '0', volts: 6 },
    { id: 'S1', type: 'switch', a: 'p', b: 'm', closed: true },
    { id: 'L1', type: 'bulb', a: 'm', b: 'n1' },
    { id: 'W1', type: 'wire', a: 'n1', b: '0' },
  ],
}

describe('explainLitVerdict', () => {
  test('blames the open switch for a dark bulb, naming it', () => {
    expect(
      explainLitVerdict({
        status: 'CONTRADICTED',
        component: 'L1',
        predictedLit: true,
        power: 0,
        netlist: OPEN_SWITCH,
      }),
    ).toBe('The bulb stayed dark because the open switch left a gap in the loop.')
  })

  test('joins several open switches honestly', () => {
    const netlist: Netlist = {
      components: [
        ...OPEN_SWITCH.components,
        { id: 'S2', type: 'switch', a: 'm', b: 'k', closed: false },
      ],
    }
    expect(
      explainLitVerdict({
        status: 'CONTRADICTED',
        component: 'L1',
        predictedLit: true,
        power: 0,
        netlist,
      }),
    ).toBe('The bulb stayed dark because open switches left gaps in the loop.')
  })

  test('stays silent when no open switch explains the dark bulb', () => {
    expect(
      explainLitVerdict({
        status: 'CONTRADICTED',
        component: 'L1',
        predictedLit: true,
        power: 0,
        netlist: CLOSED_LOOP,
      }),
    ).toBeNull()
  })

  test('explains a lit bulb by the completed loop', () => {
    expect(
      explainLitVerdict({
        status: 'CONTRADICTED',
        component: 'L1',
        predictedLit: false,
        power: 3.6,
        netlist: CLOSED_LOOP,
      }),
    ).toBe('The bulb lit because the completed loop carries current to it.')
  })

  test('stays silent on matching predictions', () => {
    expect(
      explainLitVerdict({
        status: 'CONSISTENT',
        component: 'L1',
        predictedLit: true,
        power: 3.6,
        netlist: CLOSED_LOOP,
      }),
    ).toBeNull()
  })
})
