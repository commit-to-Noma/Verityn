import { describe, expect, it } from 'vitest'
import type { Netlist } from '../api/client'
import { netlistPreviewSeed } from './netlistPreview'

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
        { id: 'S1', kind: 'switch', closed: true, volts: undefined, ratedVolts: undefined, maxSafeWatts: undefined, x: 290, y: 80 },
        { id: 'L1', kind: 'bulb', closed: undefined, volts: undefined, ratedVolts: undefined, maxSafeWatts: undefined, x: 500, y: 80 },
        { id: 'L2', kind: 'bulb', closed: undefined, volts: undefined, ratedVolts: undefined, maxSafeWatts: undefined, x: 80, y: 250 },
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
