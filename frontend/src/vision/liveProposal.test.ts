import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proposeCircuit, type VisionProposal } from '../api/client'
import { layoutProposalFromGeometry } from '../canvas/layout'
import { toNetlist } from '../canvas/toNetlist'
import { componentReviewStatus, reviewSummary } from './review'

/** Captured live Muse Spark proposal for 05_textbook_simple (canonical form). */
function liveProposal(): VisionProposal {
  const doc = JSON.parse(
    readFileSync(
      new URL(
        '../../../tests/fixtures/vision_live/05_textbook_simple.proposal.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { source: string; proposal: VisionProposal }
  if (doc.source !== 'live') {
    throw new Error('expected the captured live proposal fixture')
  }
  return doc.proposal
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('live proposal integration (offline)', () => {
  it('passes the client guard with strict null keys intact', async () => {
    const proposal = liveProposal()
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
    const { seed } = layoutProposalFromGeometry(liveProposal(), { width: 687, height: 291 })
    expect(seed.nodes).toHaveLength(2)
    const battery = seed.nodes.find((node) => node.id === 'battery_1')
    const bulb = seed.nodes.find((node) => node.id === 'bulb_1')
    expect(battery?.kind).toBe('battery')
    expect(battery?.polarity).toEqual({ positive: 'a', negative: 'b' })
    expect((battery?.x ?? 0)).toBeLessThan(bulb?.x ?? 0)
    expect(seed.edges).toHaveLength(2)
  })

  it('converts to a single-loop netlist the solver can judge', () => {
    const { seed } = layoutProposalFromGeometry(liveProposal(), { width: 687, height: 291 })
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
    const proposal = liveProposal()
    expect(componentReviewStatus('battery_1', proposal, false)).toBe('verified')
    expect(componentReviewStatus('bulb_1', proposal, false)).toBe('verified')
    expect(reviewSummary(proposal)).toBe('We found 1 battery, 1 bulb, 2 proposed connections.')
  })
})
