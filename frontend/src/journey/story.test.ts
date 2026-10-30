import { describe, expect, it } from 'vitest'
import type { SimulateResult } from '../api/client'
import type { TraceInput } from '../lessons/trace'
import type { ChapterRecap } from './story'
import { evidenceCards, finaleNarrative, learningProgress, storyNodes } from './story'

function solved(power: Record<string, number>): SimulateResult {
  const components: SimulateResult['components'] = {}
  for (const [id, watts] of Object.entries(power)) {
    components[id] = { voltage: 6, current: watts === 0 ? 0 : 0.6, power: watts }
  }
  return { ok: true, node_voltages: {}, components, error_code: null, error_message: '', component_ids: [], conditions: {}, ratings: {} }
}

function chapter(id: string, input: Partial<TraceInput>): ChapterRecap {
  return {
    id,
    title: id,
    solo: id === 'L1T2',
    input: {
      prediction: null,
      question: 'q',
      netlist: null,
      result: null,
      verdict: null,
      expectedLit: null,
      coach: null,
      coachAvailable: false,
      ...input,
    },
  }
}

const L1_INPUT: Partial<TraceInput> = {
  prediction: { lessonId: 'L1', choice: 'yes', why: 'Looks complete.' },
  result: solved({ L1: 3.6 }),
}

const TWIST_INPUT: Partial<TraceInput> = {
  prediction: { lessonId: 'L1T1', choice: 'yes', why: '' },
  result: solved({ L1: 0 }),
  verdict: { status: 'CONTRADICTED', evidence: { 'L1.power': 0 } },
  coach: { phase: 'done', text: 'Why?', provider: 'prototype-fake' },
}

const TRANSFER_INPUT: Partial<TraceInput> = {
  prediction: { lessonId: 'L1T2', choice: 'yes', why: '' },
  netlist: {
    components: [
      { id: 'L1', type: 'bulb', a: 'm', b: 'n1' },
      { id: 'L2', type: 'bulb', a: 'm', b: 'n1' },
    ],
  },
  result: solved({ L1: 3.6, L2: 3.6 }),
  verdict: { status: 'CONSISTENT', evidence: { 'L2.power': 3.6 } },
}

describe('finaleNarrative', () => {
  const chapters = () => [
    chapter('L1', L1_INPUT),
    chapter('L1T1', TWIST_INPUT),
    chapter('L1T2', TRANSFER_INPUT),
  ]

  it('narrates the completed journey in three factual sentences', () => {
    expect(finaleNarrative(chapters())).toEqual([
      'You predicted that the open circuit would light the bulb.',
      'Then, with the switch open, the simulator measured 0 A and 0 W, and L1 stayed dark.',
      'You then completed a new circuit independently (2 bulbs lit) and tested your prediction without AI coaching.',
    ])
  })

  it('adapts the first sentence to the recorded choice', () => {
    const no = chapters()
    no[0] = chapter('L1', {
      ...L1_INPUT,
      prediction: { lessonId: 'L1', choice: 'no', why: '' },
    })
    expect(finaleNarrative(no)[0]).toBe('You predicted that the open circuit would stay dark.')
  })

  it('reports a mismatched solo honestly', () => {
    const missed = chapters()
    missed[2] = chapter('L1T2', {
      ...TRANSFER_INPUT,
      verdict: { status: 'CONTRADICTED', evidence: { 'L2.power': 0 } },
    })
    expect(finaleNarrative(missed)[2]).toContain('did not match your prediction')
  })

  it('skips chapters without evidence instead of inventing closure', () => {
    const chapters = [
      chapter('L1', L1_INPUT),
      { id: 'L1T1', title: 't', solo: false, input: null },
      { id: 'L1T2', title: 't', solo: true, input: null },
    ]
    expect(finaleNarrative(chapters)).toEqual([
      'You predicted that the open circuit would light the bulb.',
    ])
  })
})

describe('storyNodes', () => {
  it('tells the demo journey in five beats', () => {
    const nodes = storyNodes([
      chapter('L1', L1_INPUT),
      chapter('L1T1', TWIST_INPUT),
      chapter('L1T2', TRANSFER_INPUT),
    ])
    expect(nodes.map((node) => node.title)).toEqual([
      'First belief',
      'Reality check evidence',
      'Coach question',
      'Solo prediction',
      'Verified transfer',
    ])
    expect(nodes[0].detail).toBe('Predicted “Yes”  -  “Looks complete.”')
    expect(nodes[1].detail).toBe('Prediction did not match: L1 dark at 0 W')
    expect(nodes[2].detail).toBe('One guiding question (Fallback coach)')
    expect(nodes[3].detail).toBe('Predicted “Yes”')
    expect(nodes[4].detail).toBe('Verified: 2 bulbs lit')
  })

  it('handles a consistent reality check with no coaching', () => {
    const nodes = storyNodes([
      chapter('L1', L1_INPUT),
      chapter('L1T1', {
        ...TWIST_INPUT,
        verdict: { status: 'CONSISTENT', evidence: { 'L1.power': 0 } },
        coach: null,
      }),
      chapter('L1T2', TRANSFER_INPUT),
    ])
    expect(nodes[1].detail).toBe('Prediction matched: L1 dark at 0 W')
    expect(nodes[2].detail).toBe('No coaching')
  })

  it('degrades gracefully when chapters are missing', () => {
    const nodes = storyNodes([])
    expect(nodes).toHaveLength(5)
    expect(nodes[0].detail).toBe('Not reached')
    expect(nodes[1].detail).toBe('No verdict recorded')
    expect(nodes[4].detail).toBe('No verdict recorded')
  })
})

describe('learningProgress', () => {
  it('explains the measured transition from building to independent transfer', () => {
    const progress = learningProgress([
      chapter('L1', {
        ...L1_INPUT,
        netlist: {
          components: [{ id: 'L1', type: 'bulb', a: 'm', b: 'n1' }],
        },
      }),
      chapter('L1T1', {
        ...TWIST_INPUT,
        netlist: {
          components: [
            { id: 'S1', type: 'switch', closed: false, a: 'p', b: 'm' },
            { id: 'L1', type: 'bulb', a: 'm', b: 'n1' },
          ],
        },
      }),
      chapter('L1T2', TRANSFER_INPUT),
    ])

    expect(progress).toHaveLength(3)
    expect(progress.every((step) => step.complete)).toBe(true)
    expect(progress[0]?.evidence).toContain('L1: 0.6 A, 3.6 W')
    expect(progress[0]?.learning).toContain('repaired circuit carried current')
    expect(progress[1]?.evidence).toContain('S1 open')
    expect(progress[1]?.learning).toContain('complete conducting path')
    expect(progress[2]?.evidence).toContain('Coach off')
    expect(progress[2]?.learning).toContain('not a measure of overall mastery')
  })

  it('does not claim progress when solver evidence is missing', () => {
    const progress = learningProgress([])
    expect(progress.every((step) => !step.complete)).toBe(true)
    expect(progress[0]?.evidence).toContain('No completed-circuit measurement')
    expect(progress[2]?.learning).toContain('with the coach off')
  })
})

describe('evidenceCards', () => {
  it('summarizes claim, evidence, and solo transfer', () => {
    const cards = evidenceCards([
      chapter('L1', L1_INPUT),
      chapter('L1T1', TWIST_INPUT),
      chapter('L1T2', TRANSFER_INPUT),
    ])
    expect(cards.map((card) => card.title)).toEqual([
      'Prediction',
      'Simulator evidence',
      'Independent transfer',
    ])
    expect(cards[0].detail).toBe('Predicted “Yes”  -  “Looks complete.”')
    expect(cards[1].detail).toBe('Prediction did not match: L1 dark at 0 W')
    expect(cards[2].detail).toBe('Verified: 2 bulbs lit')
  })

  it('degrades gracefully when chapters are missing', () => {
    const cards = evidenceCards([])
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      expect(card.detail).toBe('Complete this chapter to unlock its evidence.')
    }
  })

  it('placeholds only the skipped chapter', () => {
    const cards = evidenceCards([
      chapter('L1', L1_INPUT),
      { id: 'L1T1', title: 'L1T1', solo: false, input: null },
      chapter('L1T2', TRANSFER_INPUT),
    ])
    expect(cards[0].detail).toBe('Predicted “Yes”  -  “Looks complete.”')
    expect(cards[1].detail).toBe('Complete this chapter to unlock its evidence.')
    expect(cards[2].detail).toBe('Verified: 2 bulbs lit')
  })
})
