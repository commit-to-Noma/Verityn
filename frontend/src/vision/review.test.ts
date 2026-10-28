import { describe, expect, it } from 'vitest'
import type { VisionProposal } from '../api/client'
import {
  canLoadProposal,
  componentReviewStatus,
  connectionReviewStatus,
  nextRevealStep,
  polarityText,
  regionStyle,
  reviewBanner,
  reviewSummary,
} from './review'

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
        closed: null,
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

describe('componentReviewStatus', () => {
  it('marks unsupported diagrams', () => {
    expect(
      componentReviewStatus('B1', proposal({ status: 'unsupported', components: [] }), false),
    ).toBe('unsupported-diagram')
  })

  it('marks learner corrections first', () => {
    expect(componentReviewStatus('B1', proposal({ status: 'ready' }), true)).toBe(
      'learner-corrected',
    )
  })

  it('marks parts touched by uncertain wires', () => {
    expect(componentReviewStatus('B1', proposal({}), false)).toBe('needs-review')
  })

  it('marks unknown switch state and polarity for review', () => {
    const unknownSwitch = proposal({
      status: 'ready',
      connections: [],
      components: [
        {
          id: 'S1',
          type: 'switch',
          closed: null,
          polarity: null,
          evidence: EVIDENCE('r-s'),
        },
      ],
    })
    expect(componentReviewStatus('S1', unknownSwitch, false)).toBe('needs-review')
    const unknownPolarity = proposal({
      status: 'ready',
      connections: [],
      components: [
        {
          id: 'B1',
          type: 'battery',
          closed: null,
          polarity: null,
          evidence: EVIDENCE('r-b'),
        },
      ],
    })
    expect(componentReviewStatus('B1', unknownPolarity, false)).toBe('needs-review')
  })

  it('verifies certain ready proposals', () => {
    const certain = proposal({ status: 'ready', connections: [] })
    expect(componentReviewStatus('B1', certain, false)).toBe('verified')
  })
})

describe('connectionReviewStatus', () => {
  it('flags uncertain wires as ambiguous', () => {
    expect(connectionReviewStatus({ uncertain: true })).toBe('connection-ambiguous')
    expect(connectionReviewStatus({ uncertain: false })).toBe('verified')
  })
})

describe('reviewSummary', () => {
  it('counts live proposal parts', () => {
    expect(reviewSummary(proposal({}))).toBe('We found 1 battery, 1 proposed connection.')
  })

  it('pluralizes each kind', () => {
    const two = proposal({
      components: [
        { id: 'B1', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' }, evidence: EVIDENCE('a') },
        { id: 'S1', type: 'switch', closed: true, polarity: null, evidence: EVIDENCE('b') },
        { id: 'L1', type: 'bulb', closed: null, polarity: null, evidence: EVIDENCE('c') },
      ],
    })
    expect(reviewSummary(two)).toBe('We found 1 battery, 1 switch, 1 bulb, 1 proposed connection.')
  })
})

describe('nextRevealStep', () => {
  it('advances image to regions to replica to review', () => {
    expect(nextRevealStep('image', false)).toBe('regions')
    expect(nextRevealStep('regions', false)).toBe('replica')
    expect(nextRevealStep('replica', false)).toBe('review')
    expect(nextRevealStep('review', false)).toBe('review')
  })

  it('jumps to review on interrupt', () => {
    expect(nextRevealStep('image', true)).toBe('review')
    expect(nextRevealStep('regions', true)).toBe('review')
  })
})
