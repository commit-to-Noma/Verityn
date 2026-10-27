import { describe, expect, it } from 'vitest'
import type { VisionProposal } from '../api/client'
import { counterStarts, layoutProposal } from './layout'

const PROPOSAL: VisionProposal = {
  components: [
    { id: 'B1', type: 'battery' },
    { id: 'S1', type: 'switch', closed: false },
    { id: 'L1', type: 'bulb' },
  ],
  connections: [
    { from: { node: 'B1', terminal: 'a' }, to: { node: 'S1', terminal: 'a' }, uncertain: false },
    { from: { node: 'S1', terminal: 'b' }, to: { node: 'L1', terminal: 'a' }, uncertain: true },
  ],
}

describe('layoutProposal', () => {
  it('places parts on a deterministic grid', () => {
    const { seed } = layoutProposal(PROPOSAL)
    expect(seed.nodes).toEqual([
      { id: 'B1', kind: 'battery', closed: undefined, x: 60, y: 140 },
      { id: 'S1', kind: 'switch', closed: false, x: 250, y: 140 },
      { id: 'L1', kind: 'bulb', closed: undefined, x: 440, y: 140 },
    ])
    expect(layoutProposal(PROPOSAL).seed).toEqual(seed)
  })

  it('names wires V1..Vn and tracks uncertain ids', () => {
    const { seed, uncertainIds } = layoutProposal(PROPOSAL)
    expect(seed.edges).toEqual([
      { id: 'V1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
      { id: 'V2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
    ])
    expect(uncertainIds).toEqual(['V2'])
  })

  it('wraps to a second row after three parts', () => {
    const wide: VisionProposal = {
      components: [
        { id: 'B1', type: 'battery' },
        { id: 'B2', type: 'battery' },
        { id: 'B3', type: 'battery' },
        { id: 'L1', type: 'bulb' },
      ],
      connections: [],
    }
    const { seed, uncertainIds } = layoutProposal(wide)
    expect(seed.nodes[3]).toMatchObject({ id: 'L1', x: 60, y: 300 })
    expect(seed.edges).toEqual([])
    expect(uncertainIds).toEqual([])
  })
})

describe('counterStarts', () => {
  it('takes the highest numeric suffix per kind', () => {
    expect(counterStarts([{ id: 'B1' }, { id: 'B5' }, { id: 'L2' }, { id: 'S3' }])).toEqual({
      battery: 5,
      bulb: 2,
      switch: 3,
    })
  })

  it('ignores non-matching ids', () => {
    expect(counterStarts([{ id: 'X9' }, { id: 'B' }, { id: 'L0x' }])).toEqual({
      battery: 0,
      bulb: 0,
      switch: 0,
    })
  })
})
