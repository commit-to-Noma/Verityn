import { describe, expect, it } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import type { TraceInput } from './trace'
import { buildTrace, SOLO_COACH_MESSAGE, summarizeNetlist, summarizeSolver } from './trace'

const LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
    { id: 'S1', type: 'switch', closed: false, a: 'p', b: 'm' },
    { id: 'L1', type: 'bulb', a: 'm', b: 'n1' },
    { id: 'W9', type: 'wire', a: 'n1', b: '0' },
  ],
}

const DARK_RESULT: SimulateResult = {
  ok: true,
  node_voltages: { p: 6, m: 0, n1: 0, '0': 0 },
  components: {
    B1: { voltage: 6, current: 0, power: 0 },
    S1: { voltage: 6, current: 0, power: 0 },
    L1: { voltage: 0, current: 0, power: 0 },
    W9: { voltage: 0, current: 0, power: 0 },
  },
  error_code: null,
  error_message: '',
  component_ids: [],
  conditions: {},
  ratings: {},
}

const LIT_RESULT: SimulateResult = {
  ...DARK_RESULT,
  components: {
    ...DARK_RESULT.components,
    L1: { voltage: 6, current: 0.6, power: 3.6 },
  },
}

const REJECTED_RESULT: SimulateResult = {
  ok: false,
  node_voltages: {},
  components: {},
  error_code: 'DANGLING_TERMINAL',
  error_message: 'The circuit has loose ends.',
  component_ids: ['B1', 'L1'],
  conditions: {},
  ratings: {},
}

function baseInput(overrides: Partial<TraceInput> = {}): TraceInput {
  return {
    prediction: { lessonId: 'L1T1', choice: 'yes', why: 'The switch is open.' },
    question: 'Will the bulb light?',
    netlist: LOOP,
    result: DARK_RESULT,
    verdict: { status: 'CONTRADICTED', evidence: { 'L1.power_W': 0 } },
    expectedLit: null,
    coach: { phase: 'done', text: 'What does the open switch change?', provider: 'prototype-fake' },
    coachAvailable: true,
    ...overrides,
  }
}

describe('summarizeNetlist', () => {
  it('lists every component faithfully in netlist order', () => {
    expect(summarizeNetlist(LOOP)).toEqual([
      { id: 'B1', kind: 'Battery', detail: '6 V · p ↔ 0' },
      { id: 'S1', kind: 'Switch', detail: 'open · p ↔ m' },
      { id: 'L1', kind: 'Bulb', detail: 'm ↔ n1' },
      { id: 'W9', kind: 'Wire', detail: 'n1 ↔ 0' },
    ])
  })

  it('reports a closed switch distinctly', () => {
    const closed: Netlist = {
      components: [{ id: 'S1', type: 'switch', closed: true, a: 'p', b: 'm' }],
    }
    expect(summarizeNetlist(closed)).toEqual([
      { id: 'S1', kind: 'Switch', detail: 'closed · p ↔ m' },
    ])
  })

  it('handles missing attributes without crashing', () => {
    const sparse: Netlist = {
      components: [
        { id: 'B1', type: 'battery', a: 'p', b: '0' },
        { id: 'S1', type: 'switch', a: 'p', b: 'm' },
      ],
    }
    expect(summarizeNetlist(sparse)).toEqual([
      { id: 'B1', kind: 'Battery', detail: 'voltage unknown · p ↔ 0' },
      { id: 'S1', kind: 'Switch', detail: 'unknown · p ↔ m' },
    ])
  })

  it('returns no rows for an empty netlist', () => {
    expect(summarizeNetlist({ components: [] })).toEqual([])
  })
})

describe('summarizeSolver', () => {
  it('reports lit bulbs with their facts', () => {
    expect(summarizeSolver(LIT_RESULT, LOOP)).toEqual({
      ok: true,
      lit: [{ id: 'L1', current: 0.6, power: 3.6 }],
      darkBulbs: [],
    })
  })

  it('reports dark bulbs separately', () => {
    expect(summarizeSolver(DARK_RESULT, LOOP)).toEqual({
      ok: true,
      lit: [],
      darkBulbs: ['L1'],
    })
  })

  it('treats power at the noise floor as dark', () => {
    const floor: SimulateResult = {
      ...DARK_RESULT,
      components: { L1: { voltage: 0, current: 0, power: 1e-9 } },
    }
    const summary = summarizeSolver(floor, LOOP)
    expect(summary).toEqual({ ok: true, lit: [], darkBulbs: ['L1'] })
  })

  it('reports rejections with code and offender ids', () => {
    expect(summarizeSolver(REJECTED_RESULT, LOOP)).toEqual({
      ok: false,
      code: 'DANGLING_TERMINAL',
      message: 'The circuit has loose ends.',
      offenders: ['B1', 'L1'],
    })
  })
})

describe('buildTrace', () => {
  it('assembles the full twist journey in order', () => {
    const steps = buildTrace(baseInput())
    expect(steps.map((step) => step.id)).toEqual([
      'prediction',
      'circuit',
      'simulation',
      'comparison',
      'coach',
    ])
    expect(steps[0]?.body).toEqual({
      kind: 'prediction',
      choiceLabel: 'Yes',
      why: 'The switch is open.',
      question: 'Will the bulb light?',
    })
    expect(steps[3]?.body).toEqual({
      kind: 'comparison',
      status: 'CONTRADICTED',
      note: 'Checked by the deterministic evaluator against your built circuit.',
      evidence: [{ id: 'L1', watts: 0 }],
    })
    expect(steps[4]?.body).toEqual({
      kind: 'coach',
      outcome: {
        phase: 'done',
        text: 'What does the open switch change?',
        provider: 'prototype-fake',
      },
      hint: '',
    })
  })

  it('notes an empty reason instead of inventing one', () => {
    const steps = buildTrace(
      baseInput({ prediction: { lessonId: 'L1T1', choice: 'no', why: '   ' } }),
    )
    expect(steps[0]?.body).toMatchObject({ kind: 'prediction', why: null })
  })

  it('derives the L1 comparison from the pack expectation', () => {
    const yes = buildTrace(
      baseInput({ verdict: null, expectedLit: false, coachAvailable: false }),
    )
    expect(yes.map((step) => step.id)).toEqual(['prediction', 'circuit', 'simulation', 'comparison'])
    expect(yes[3]?.body).toMatchObject({ kind: 'comparison', status: 'CONTRADICTED' })

    const no = buildTrace(
      baseInput({
        verdict: null,
        expectedLit: false,
        coachAvailable: false,
        prediction: { lessonId: 'L1', choice: 'no', why: '' },
      }),
    )
    expect(no[3]?.body).toMatchObject({ kind: 'comparison', status: 'CONSISTENT' })

    const unsure = buildTrace(
      baseInput({
        verdict: null,
        expectedLit: false,
        coachAvailable: false,
        prediction: { lessonId: 'L1', choice: 'not_sure', why: '' },
      }),
    )
    expect(unsure[3]?.body).toMatchObject({ kind: 'comparison', status: 'UNASSESSABLE' })
  })

  it('stays honest when the circuit is invalid', () => {
    const steps = buildTrace(
      baseInput({ result: REJECTED_RESULT, verdict: null, coach: null }),
    )
    expect(steps[2]?.body).toMatchObject({ kind: 'solver', summary: { ok: false } })
    expect(steps[3]?.body).toMatchObject({ kind: 'comparison', status: 'UNASSESSABLE' })
    expect(steps[4]?.body).toMatchObject({ kind: 'coach', outcome: null })
  })

  it('explains a consistent verdict with no coaching', () => {
    const steps = buildTrace(
      baseInput({
        verdict: { status: 'CONSISTENT', evidence: { 'L1.power_W': 0 } },
        coach: null,
      }),
    )
    expect(steps[4]?.body).toEqual({
      kind: 'coach',
      outcome: null,
      hint: 'Your prediction matched the circuit result, so no coaching was offered.',
    })
  })

  it('explains a contradicted verdict before the coach is asked', () => {
    const steps = buildTrace(baseInput({ coach: null }))
    expect(steps[4]?.body).toMatchObject({
      kind: 'coach',
      outcome: null,
      hint: expect.stringContaining('have not asked the coach yet'),
    })
  })

  it('passes coach refusals through with their message', () => {
    const steps = buildTrace(
      baseInput({ coach: { phase: 'unavailable', message: 'Not eligible for coaching.' } }),
    )
    expect(steps[4]?.body).toMatchObject({
      kind: 'coach',
      outcome: { phase: 'unavailable', message: 'Not eligible for coaching.' },
    })
  })

  it('shows the solo transfer journey without coaching', () => {
    const steps = buildTrace(
      baseInput({
        prediction: { lessonId: 'L1T2', choice: 'yes', why: 'It spans the loop.' },
        verdict: { status: 'CONSISTENT', evidence: { 'L2.power_W': 3.6 } },
        coach: { phase: 'unavailable', message: SOLO_COACH_MESSAGE },
      }),
    )
    expect(steps.map((step) => step.id)).toEqual([
      'prediction',
      'circuit',
      'simulation',
      'comparison',
      'coach',
    ])
    expect(steps[3]?.body).toMatchObject({ kind: 'comparison', status: 'CONSISTENT' })
    expect(steps[4]?.body).toEqual({
      kind: 'coach',
      outcome: { phase: 'unavailable', message: SOLO_COACH_MESSAGE },
      hint: '',
    })
  })

  it('keeps the solo note when the transfer circuit is invalid', () => {
    const steps = buildTrace(
      baseInput({
        result: REJECTED_RESULT,
        verdict: null,
        coach: { phase: 'unavailable', message: SOLO_COACH_MESSAGE },
      }),
    )
    expect(steps[3]?.body).toMatchObject({ kind: 'comparison', status: 'UNASSESSABLE' })
    expect(steps[4]?.body).toMatchObject({
      kind: 'coach',
      outcome: { phase: 'unavailable', message: SOLO_COACH_MESSAGE },
    })
  })

  it('withholds comparison until the verdict is checked', () => {
    const steps = buildTrace(baseInput({ verdict: null, coach: null }))
    expect(steps[3]?.body).toEqual({
      kind: 'comparison',
      status: 'UNASSESSABLE',
      note: 'Test a complete circuit first  -  there is nothing to check yet.',
      evidence: [],
    })
  })

  it('names the real reason when Not sure skips the verdict', () => {
    const steps = buildTrace(
      baseInput({
        prediction: { lessonId: 'L1T1', choice: 'not_sure', why: '' },
        verdict: null,
        coach: null,
      }),
    )
    expect(steps[3]?.body).toEqual({
      kind: 'comparison',
      status: 'UNASSESSABLE',
      note: 'No definite prediction was recorded, so there is nothing to check.',
      evidence: [],
    })
  })

  it('degrades gracefully when evidence is missing', () => {
    const steps = buildTrace(
      baseInput({
        prediction: null,
        netlist: null,
        result: null,
        verdict: null,
        expectedLit: null,
        coach: null,
      }),
    )
    expect(steps[0]?.body).toEqual({ kind: 'empty', text: 'No prediction was recorded.' })
    expect(steps[1]?.body).toEqual({ kind: 'empty', text: 'No circuit has been tested yet.' })
    expect(steps[2]?.body).toEqual({ kind: 'empty', text: 'Not simulated yet.' })
    expect(steps[3]?.body).toMatchObject({ kind: 'comparison', status: 'UNASSESSABLE' })
  })

  it('adds a demonstration timeline only for recorded events', () => {
    const events = [
      { phase: 'proposed', label: 'Coach wants to close S1.' },
      { phase: 'applied', label: 'Coach wants to close S1.' },
      { phase: 'observed', label: 'Solver observed L1 3.6 W' },
    ] as const
    const withDemo = buildTrace(
      baseInput({ demonstrations: events.map((event) => ({ ...event })) }),
    )
    expect(withDemo[withDemo.length - 1]).toMatchObject({
      id: 'demonstration',
      title: 'Demonstration',
    })
    const withoutDemo = buildTrace(baseInput({}))
    expect(withoutDemo.some((step) => step.id === 'demonstration')).toBe(false)
    const emptied = buildTrace(baseInput({ demonstrations: [] }))
    expect(emptied.some((step) => step.id === 'demonstration')).toBe(false)
  })
})
