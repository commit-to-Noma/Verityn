import { describe, expect, it } from 'vitest'
import type { Netlist } from '../api/client'
import { loopOrderPartIds, netlistPreviewSeed, perimeterSlots } from './netlistPreview'

describe('netlistPreviewSeed', () => {
  it('preserves actual parts, switch state, and wire endpoints', () => {
    const netlist: Netlist = {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
        { id: 'S1', type: 'switch', closed: true, a: 'S1.a', b: 'S1.b' },
        { id: 'L1', type: 'bulb', a: 'L1.a', b: 'L1.b' },
        { id: 'L2', type: 'bulb', a: 'L2.a', b: 'L2.b' },
        { id: 'W1', type: 'wire', a: 'B1.a', b: 'S1.a' },
        { id: 'W2', type: 'wire', a: 'S1.b', b: 'L1.a' },
        { id: 'W3', type: 'wire', a: 'L1.b', b: 'B1.b' },
        { id: 'W4', type: 'wire', a: 'L2.a', b: 'L1.a' },
        { id: 'W5', type: 'wire', a: 'L2.b', b: 'L1.b' },
      ],
    }

    expect(netlistPreviewSeed(netlist)).toEqual({
      nodes: [
        { id: 'B1', kind: 'battery', volts: 6, closed: undefined, ratedVolts: undefined, maxSafeWatts: undefined, x: 80, y: 80 },
        { id: 'S1', kind: 'switch', closed: true, volts: undefined, ratedVolts: undefined, maxSafeWatts: undefined, x: 340, y: 80 },
        { id: 'L1', kind: 'bulb', closed: undefined, volts: undefined, ratedVolts: undefined, maxSafeWatts: undefined, x: 340, y: 290 },
        { id: 'L2', kind: 'bulb', closed: undefined, volts: undefined, ratedVolts: undefined, maxSafeWatts: undefined, x: 80, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
        { id: 'W2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
        { id: 'W3', source: 'L1', sourceTerminal: 'b', target: 'B1', targetTerminal: 'b' },
        { id: 'W4', source: 'L2', sourceTerminal: 'a', target: 'L1', targetTerminal: 'a' },
        { id: 'W5', source: 'L2', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    })
  })

  it('walks the loop from the battery regardless of part order', () => {
    const ends = (node: string) => ({ node, terminal: 'a' as const })
    const wires = [
      { id: 'W1', source: ends('B1'), target: ends('S1') },
      { id: 'W2', source: ends('S1'), target: ends('L1') },
      { id: 'W3', source: ends('L1'), target: ends('B1') },
    ]
    expect(loopOrderPartIds(['L1', 'S1', 'B1'], wires, 'B1')).toEqual(['B1', 'S1', 'L1'])
    expect(loopOrderPartIds(['L1', 'S1', 'B1', 'LX'], wires, 'B1')).toEqual([
      'B1',
      'S1',
      'L1',
      'LX',
    ])
  })

  it('uses the saved node positions when every circuit part has one', () => {
    const netlist: Netlist = {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
        { id: 'L1', type: 'bulb', a: 'L1.a', b: 'L1.b' },
        { id: 'W1', type: 'wire', a: 'B1.a', b: 'L1.a' },
        { id: 'W2', type: 'wire', a: 'L1.b', b: 'B1.b' },
      ],
    }
    const positions = {
      B1: { x: 460, y: 120 },
      L1: { x: 120, y: 360 },
    }

    expect(netlistPreviewSeed(netlist, positions)?.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'B1', x: 460, y: 120 },
      { id: 'L1', x: 120, y: 360 },
    ])
    expect(netlistPreviewSeed(netlist, { B1: positions.B1 })?.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'B1', x: 80, y: 80 },
      { id: 'L1', x: 340, y: 80 },
    ])
  })

  it('places consecutive loop parts on adjacent perimeter cells', () => {
    expect(perimeterSlots(4)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 0, row: 1 },
    ])
    const slots = perimeterSlots(6)
    expect(slots).toHaveLength(6)
    for (let index = 1; index < slots.length; index++) {
      const manhattan =
        Math.abs(slots[index].col - slots[index - 1].col) +
        Math.abs(slots[index].row - slots[index - 1].row)
      expect(manhattan).toBe(1)
    }
  })

  it('rejects topology that cannot be represented without omission', () => {
    expect(
      netlistPreviewSeed({
        components: [
          { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
          { id: 'R1', type: 'resistor', ohms: 10, a: 'R1.a', b: 'R1.b' },
        ],
      }),
    ).toBeNull()
    expect(
      netlistPreviewSeed({
        components: [
          { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
          { id: 'W1', type: 'wire', a: 'unknown.a', b: 'B1.b' },
        ],
      }),
    ).toBeNull()
  })
})
