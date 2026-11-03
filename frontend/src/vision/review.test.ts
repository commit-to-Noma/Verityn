import { describe, expect, it } from 'vitest'
import type { VisionProposal } from '../api/client'
import {
  DEFAULT_LENS_VIEW,
  LENS_VIEW_MODES,
  ambiguousWireNote,
  canLoadProposal,
  canTestProposal,
  componentReviewStatus,
  connectionReviewStatus,
  nextRevealStep,
  polarityText,
  proposalHealth,
  regionStyle,
  reviewBanner,
  reviewSummary,
  wirePathPoints,
  wireTraceSummary,
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
        evidence: { region_id: 'r-w', path: null },
      },
    ],
    ...overrides,
  }
}

describe('reviewBanner', () => {
  it('blocks unsupported diagrams without guessing', () => {
    const banner = reviewBanner('unsupported', 0, 0)
    expect(banner.tone).toBe('blocked')
    expect(banner.text).toBe(
      'This image does not look like a supported circuit. Nothing was guessed.',
    )
    expect(banner.hint).toContain('battery, bulb, switch')
  })

  it('asks for review of highlighted terminals', () => {
    const banner = reviewBanner('needs_review', 2, 5)
    expect(banner.tone).toBe('warn')
    expect(banner.text).toBe(
      'Some connections need your review. Check the highlighted terminals before confirming.',
    )
    expect(banner.hint).toBeUndefined()
  })

  it('invites review of ready proposals', () => {
    const banner = reviewBanner('ready', 0, 3)
    expect(banner.tone).toBe('ok')
    expect(banner.text).toBe('Review the proposal before testing it.')
  })
})

describe('lens review modes', () => {
  it('defaults to Compare', () => {
    expect(DEFAULT_LENS_VIEW).toBe('compare')
    expect(LENS_VIEW_MODES[0]).toEqual({ id: 'compare', label: 'Compare' })
    expect(LENS_VIEW_MODES.map((mode) => mode.id)).toEqual([
      'compare',
      'original',
      'detected',
      'model',
    ])
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

describe('canTestProposal', () => {
  it('keeps needs_review proposals and ambiguous connections locked until confirmed', () => {
    const needsReview = proposal({ status: 'needs_review' })
    expect(canTestProposal(needsReview, false)).toBe(false)
    expect(canTestProposal(needsReview, true)).toBe(true)
    const ambiguousReady = proposal({ status: 'ready' })
    expect(canTestProposal(ambiguousReady, false)).toBe(false)
    expect(canTestProposal(ambiguousReady, true)).toBe(true)
  })

  it('never enables unsupported proposals', () => {
    expect(canTestProposal(proposal({ status: 'unsupported' }), true)).toBe(false)
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

describe('wire traces', () => {
  it('formats normalized paths as SVG points', () => {
    expect(
      wirePathPoints([
        [0.12, 0.3],
        [0.4, 0.2],
      ]),
    ).toBe('12.0,30.0 40.0,20.0')
  })

  it('tells traced and untraced ambiguous wires apart', () => {
    expect(ambiguousWireNote(true)).toContain('traced on your photo')
    expect(ambiguousWireNote(false)).toContain('no image region')
  })

  it('counts traced wires honestly', () => {
    expect(wireTraceSummary(0, 0)).toBe('No wires proposed.')
    expect(wireTraceSummary(3, 3)).toContain('traced on your photo')
    expect(wireTraceSummary(0, 3)).toContain('not traced from the image')
    expect(wireTraceSummary(2, 3)).toBe(
      '2 of 3 wires traced on your photo; the rest are terminal relationships only. The replica reconstructs all routes.',
    )
  })
})

describe('proposalHealth', () => {
  const full = (): VisionProposal =>
    proposal({
      status: 'needs_review',
      components: [
        { id: 'B1', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' }, evidence: EVIDENCE('r-b') },
        { id: 'S1', type: 'switch', closed: false, polarity: null, evidence: EVIDENCE('r-s') },
        { id: 'L1', type: 'bulb', closed: null, polarity: null, evidence: EVIDENCE('r-l') },
      ],
    })

  it('counts parts by kind and names open switches', () => {
    const health = proposalHealth(full())
    expect(health.partsLine).toBe('3 parts: 1 battery, 1 switch, 1 bulb')
    expect(health.openSwitches).toEqual(['S1'])
  })

  it('counts parts needing review, zero when verified', () => {
    expect(proposalHealth(full()).reviewCount).toBe(3)
    const verified = proposal({
      status: 'ready',
      components: [
        { id: 'B1', type: 'battery', closed: null, polarity: { positive: 'a', negative: 'b' }, evidence: EVIDENCE('r-b') },
      ],
      connections: [],
    })
    const health = proposalHealth(verified)
    expect(health.reviewCount).toBe(0)
    expect(health.openSwitches).toEqual([])
  })
})
