import { describe, expect, it } from 'vitest'
import type { VisionProposal } from '../api/client'
import { canLoadProposal, polarityText, regionStyle, reviewBanner } from './review'

const EVIDENCE = (region_id: string) => ({
  region_id,
  bounds: { x: 0.1, y: 0.2, width: 0.1, height: 0.2 },
  rotation: 0,
})

function proposal(overrides: Partial<VisionProposal>): VisionProposal {
  return {
    status: 'needs_review',
    components: [
      {
        id: 'B1',
        type: 'battery',
        polarity: { positive: 'a', negative: 'b' },
        evidence: EVIDENCE('r-b'),
      },
    ],
    connections: [
      {
        from: { node: 'B1', terminal: 'a' },
        to: { node: 'B1', terminal: 'b' },
        uncertain: true,
        evidence: { region_id: 'r-w' },
      },
    ],
    ...overrides,
  }
}

describe('reviewBanner', () => {
  it('blocks unsupported diagrams without guessing', () => {
    const banner = reviewBanner('unsupported', 0, 0)
    expect(banner.tone).toBe('blocked')
    expect(banner.text).toMatch(/couldn't read/i)
    expect(banner.text).toMatch(/nothing was guessed/i)
  })

  it('asks for review with exact uncertain counts', () => {
    const banner = reviewBanner('needs_review', 2, 5)
    expect(banner.tone).toBe('warn')
    expect(banner.text).toContain('2 of 5')
  })

  it('uses singular connection wording', () => {
    expect(reviewBanner('needs_review', 1, 1).text).toContain('1 of 1 connection needs')
  })

  it('confirms ready proposals', () => {
    const banner = reviewBanner('ready', 0, 3)
    expect(banner.tone).toBe('ok')
    expect(banner.text).toMatch(/review/i)
  })
})

describe('canLoadProposal', () => {
  it('loads ready proposals', () => {
    expect(canLoadProposal(proposal({ status: 'ready' }))).toBe(true)
  })

  it('loads needs_review proposals for learner correction', () => {
    expect(canLoadProposal(proposal({}))).toBe(true)
  })

  it('refuses unsupported diagrams', () => {
    expect(
      canLoadProposal(proposal({ status: 'unsupported', components: [], connections: [] })),
    ).toBe(false)
  })

  it('refuses proposals with no components', () => {
    expect(canLoadProposal(proposal({ status: 'ready', components: [] }))).toBe(false)
  })
})

describe('regionStyle', () => {
  it('maps normalized bounds to percentages', () => {
    expect(regionStyle({ x: 0.1, y: 0.2, width: 0.25, height: 0.5 })).toEqual({
      left: '10.00%',
      top: '20.00%',
      width: '25.00%',
      height: '50.00%',
    })
  })
})

describe('polarityText', () => {
  it('shows positive then negative terminals', () => {
    expect(polarityText({ positive: 'a', negative: 'b' })).toBe('+a −b')
    expect(polarityText({ positive: 'b', negative: 'a' })).toBe('+b −a')
  })
})
