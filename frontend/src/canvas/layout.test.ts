import { describe, expect, it } from 'vitest'
import type { VisionProposal } from '../api/client'
import { counterStarts, geometryPositions, layoutProposal, layoutProposalFromGeometry } from './layout'

const PROPOSAL: VisionProposal = {
  status: 'needs_review',
  components: [
    { id: 'B1', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' },
      evidence: { region_id: 'b', bounds: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
    { id: 'S1', type: 'switch', closed: false, polarity: null,
      evidence: { region_id: 's', bounds: { x: 0.4, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
    { id: 'L1', type: 'bulb', closed: null, polarity: null,
      evidence: { region_id: 'l', bounds: { x: 0.7, y: 0.2, width: 0.1, height: 0.1 }, rotation: 0 } },
  ],
  connections: [
    { from: { node: 'B1', terminal: 'a' }, to: { node: 'S1', terminal: 'a' }, uncertain: false,
      evidence: { region_id: 'w1' } },
    { from: { node: 'S1', terminal: 'b' }, to: { node: 'L1', terminal: 'a' }, uncertain: true,
      evidence: { region_id: 'w2' } },
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
      status: 'ready',
      components: [
        { id: 'B1', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' },
          evidence: { region_id: 'b1', bounds: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, rotation: 0 } },
        { id: 'B2', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' },
          evidence: { region_id: 'b2', bounds: { x: 0.3, y: 0.1, width: 0.1, height: 0.1 }, rotation: 0 } },
        { id: 'B3', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' },
          evidence: { region_id: 'b3', bounds: { x: 0.5, y: 0.1, width: 0.1, height: 0.1 }, rotation: 0 } },
        { id: 'L1', type: 'bulb', closed: null, polarity: null,
          evidence: { region_id: 'l1', bounds: { x: 0.7, y: 0.1, width: 0.1, height: 0.1 }, rotation: 0 } },
      ],
      connections: [],
    }
    const { seed, uncertainIds } = layoutProposal(wide)
    expect(seed.nodes[3]).toMatchObject({ id: 'L1', x: 60, y: 300 })
    expect(seed.edges).toEqual([])
    expect(uncertainIds).toEqual([])
  })
})

describe('geometryPositions', () => {
  it('preserves left-to-right image order on the canvas', () => {
    const positions = geometryPositions(PROPOSAL, { width: 687, height: 291 })
    expect(positions.B1?.x ?? 0).toBeLessThan(positions.S1?.x ?? 0)
    expect(positions.S1?.x ?? 0).toBeLessThan(positions.L1?.x ?? 0)
  })

  it('fits the image aspect inside the work area', () => {
    const positions = geometryPositions(PROPOSAL, { width: 687, height: 291 })
    for (const position of Object.values(positions)) {
      expect(position.x).toBeGreaterThanOrEqual(80)
      expect(position.x).toBeLessThanOrEqual(720)
      expect(position.y).toBeGreaterThanOrEqual(80)
      expect(position.y).toBeLessThanOrEqual(520)
    }
  })

  it('is deterministic and guards degenerate sizes', () => {
    const image = { width: 100, height: 100 }
    expect(geometryPositions(PROPOSAL, image)).toEqual(geometryPositions(PROPOSAL, image))
    const fallback = geometryPositions(PROPOSAL, { width: 0, height: 0 })
    for (const position of Object.values(fallback)) {
      expect(Number.isFinite(position.x)).toBe(true)
      expect(Number.isFinite(position.y)).toBe(true)
    }
  })
})

describe('layoutProposalFromGeometry', () => {
  it('seeds nodes from evidence centers with polarity intact', () => {
    const { seed, uncertainIds } = layoutProposalFromGeometry(PROPOSAL, { width: 687, height: 291 })
    expect(seed.nodes).toHaveLength(3)
    expect(seed.nodes[0]).toMatchObject({
      id: 'B1',
      kind: 'battery',
      polarity: { positive: 'a', negative: 'b' },
    })
    expect(seed.nodes[0]?.x).toBeLessThan(seed.nodes[2]?.x ?? 0)
    expect(uncertainIds).toEqual(['V2'])
  })

  it('seeds unknown switches open, never closed', () => {
    const unknown: VisionProposal = {
      ...PROPOSAL,
      components: PROPOSAL.components.map((component) =>
        component.type === 'switch' ? { ...component, closed: null } : component,
      ),
    }
    const { seed } = layoutProposalFromGeometry(unknown, { width: 687, height: 291 })
    expect(seed.nodes.find((node) => node.id === 'S1')).toMatchObject({
      kind: 'switch',
      closed: false,
    })
  })

  it('drops unknown polarity instead of inventing terminals', () => {
    const unknown: VisionProposal = {
      ...PROPOSAL,
      components: PROPOSAL.components.map((component) =>
        component.type === 'battery' ? { ...component, polarity: null } : component,
      ),
    }
    const { seed } = layoutProposalFromGeometry(unknown, { width: 687, height: 291 })
    expect(seed.nodes.find((node) => node.id === 'B1')).toMatchObject({
      kind: 'battery',
      polarity: undefined,
    })
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
