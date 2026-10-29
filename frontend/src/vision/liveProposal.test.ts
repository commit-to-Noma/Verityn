import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proposeCircuit, type VisionProposal } from '../api/client'
import { layoutProposalFromGeometry } from '../canvas/layout'
import { toNetlist } from '../canvas/toNetlist'
import { componentReviewStatus, reviewSummary } from './review'

/** Captured live Muse Spark proposal (canonical form) by fixture file. */
function liveProposal(filename: string): VisionProposal {
  const doc = JSON.parse(
    readFileSync(
      new URL(
        `../../../tests/fixtures/vision_live/${filename}`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { source: string; proposal: VisionProposal }
  if (doc.source !== 'live') {
    throw new Error(`expected a captured live proposal fixture: ${filename}`)
  }
  return doc.proposal
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('live proposal integration (offline)', () => {
  it('passes the client guard with strict null keys intact', async () => {
    const proposal = liveProposal('05_textbook_simple.proposal.json')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({ ok: true, status: 200, json: async () => ({ proposal, assumptions: [], provider: 'meta-spark' }) }) as Response,
      ),
    )
    const result = await proposeCircuit('data:image/png;base64,AA==')
    expect(result.proposal.status).toBe('ready')
    expect(result.proposal.components).toHaveLength(2)
    expect(result.proposal.components[0]?.polarity).toEqual({ positive: 'a', negative: 'b' })
    expect(result.proposal.components[1]?.polarity).toBeNull()
  })

  it('maps image geometry to canvas order with polarity preserved', () => {
    const { seed } = layoutProposalFromGeometry(liveProposal('05_textbook_simple.proposal.json'), { width: 687, height: 291 })
    expect(seed.nodes).toHaveLength(2)
    const battery = seed.nodes.find((node) => node.id === 'battery_1')
    const bulb = seed.nodes.find((node) => node.id === 'bulb_1')
    expect(battery?.kind).toBe('battery')
    expect(battery?.polarity).toEqual({ positive: 'a', negative: 'b' })
    expect((battery?.x ?? 0)).toBeLessThan(bulb?.x ?? 0)
    expect(seed.edges).toHaveLength(2)
  })

  it('converts to a single-loop netlist the solver can judge', () => {
    const { seed } = layoutProposalFromGeometry(liveProposal('05_textbook_simple.proposal.json'), { width: 687, height: 291 })
    const netlist = toNetlist({
      nodes: seed.nodes.map((node) => ({ id: node.id, kind: node.kind, closed: node.closed })),
      edges: seed.edges,
    })
    const kinds = netlist.components.map((part) => part.type).sort()
    expect(kinds).toEqual(['battery', 'bulb', 'wire', 'wire'])
    const battery = netlist.components.find((part) => part.id === 'battery_1')
    expect(battery).toMatchObject({ type: 'battery', volts: 6 })
    const junctions = new Set<string>()
    for (const part of netlist.components) {
      if (part.type === 'wire') {
        junctions.add(`${part.a}|${part.b}`)
      }
    }
    expect(junctions).toEqual(
      new Set(['battery_1.a|bulb_1.a', 'bulb_1.b|battery_1.b']),
    )
  })

  it('reports both live parts verified with an honest summary', () => {
    const proposal = liveProposal('05_textbook_simple.proposal.json')
    expect(componentReviewStatus('battery_1', proposal, false)).toBe('verified')
    expect(componentReviewStatus('bulb_1', proposal, false)).toBe('verified')
    expect(reviewSummary(proposal)).toBe('We found 1 battery, 1 bulb, 2 proposed connections.')
  })
})

describe('live switch proposal integration (offline)', () => {
  const FILENAME = '06_textbook_switch.proposal.json'

  it('maps three image-derived parts with the open switch intact', () => {
    const { seed } = layoutProposalFromGeometry(liveProposal(FILENAME), { width: 508, height: 366 })
    expect(seed.nodes).toHaveLength(3)
    const byId = new Map(seed.nodes.map((node) => [node.id, node]))
    expect(byId.get('battery_1')?.kind).toBe('battery')
    expect(byId.get('switch_1')).toMatchObject({ kind: 'switch', closed: false })
    expect(byId.get('bulb_1')?.kind).toBe('bulb')
    expect(byId.get('battery_1')?.polarity).toBeUndefined()
    expect(seed.edges).toHaveLength(3)
  })

  it('converts to a single open-switch loop netlist', () => {
    const { seed } = layoutProposalFromGeometry(liveProposal(FILENAME), { width: 508, height: 366 })
    const netlist = toNetlist({
      nodes: seed.nodes.map((node) => ({ id: node.id, kind: node.kind, closed: node.closed })),
      edges: seed.edges,
    })
    expect(netlist.components.map((part) => part.type).sort()).toEqual([
      'battery',
      'bulb',
      'switch',
      'wire',
      'wire',
      'wire',
    ])
    expect(netlist.components.find((part) => part.id === 'switch_1')).toMatchObject({
      type: 'switch',
      closed: false,
    })
    const terminals = new Set<string>()
    for (const part of netlist.components) {
      if (part.type === 'wire') {
        terminals.add(part.a)
        terminals.add(part.b)
      }
    }
    expect(terminals.size).toBe(6)
  })

  it('flags the proposal for review over unknown polarity', () => {
    const proposal = liveProposal(FILENAME)
    expect(componentReviewStatus('battery_1', proposal, false)).toBe('needs-review')
    expect(componentReviewStatus('switch_1', proposal, false)).toBe('needs-review')
    expect(reviewSummary(proposal)).toBe(
      'We found 1 battery, 1 switch, 1 bulb, 3 proposed connections.',
    )
  })
})
