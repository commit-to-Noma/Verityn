import { describe, expect, it } from 'vitest'
import type { SimulateResult } from '../api/client'
import { toNetlist } from '../canvas/toNetlist'
import { L1 } from './l1'
import type { Choice, ExpectedFixed } from './lesson'
import {
  canProceed,
  choiceToClaim,
  CHOICE_LABELS,
  compareWithExpected,
  createPrediction,
  matchesExpected,
} from './lesson'

describe('L1 lesson pack', () => {
  it('identifies the lesson and question', () => {
    expect(L1.id).toBe('L1')
    expect(L1.title).toBe('Light the bulb')
    expect(L1.question).toBe('Will the bulb light?')
  })

  it('starts from the agreed broken netlist', () => {
    expect(L1.start).toEqual({
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
        { id: 'S1', type: 'switch', closed: true, a: 'p', b: 'm' },
        { id: 'L1', type: 'bulb', a: 'm', b: 'n1' },
      ],
    })
  })

  it('stores the broken start outcome in the pack, not the evaluator', () => {
    expect(L1.expectedStart).toEqual({
      ok: false,
      code: 'DANGLING_TERMINAL',
      component_ids: ['B1', 'L1'],
      lit: false,
    })
  })

  it('fixes the start with one wire between n1 and 0', () => {
    expect(L1.fix.wire).toEqual({ a: 'n1', b: '0' })
    expect(L1.fix.hint).toBe('Connect the two open ends with one wire.')
    expect(L1.expectedFixed).toEqual({
      ok: true,
      lit: true,
      component: 'L1',
      current: 0.6,
      power: 3.6,
    })
    expect(L1.claim).toEqual({ type: 'lit', component: 'L1' })
  })

  it('seeds the canvas with the broken loop and two wires', () => {
    expect(L1.seed.nodes.map((node) => [node.id, node.kind])).toEqual([
      ['B1', 'battery'],
      ['S1', 'switch'],
      ['L1', 'bulb'],
    ])
    expect(L1.seed.nodes.find((node) => node.id === 'S1')?.closed).toBe(true)
    expect(
      L1.seed.edges.map((edge) => [
        edge.id,
        edge.source,
        edge.sourceTerminal,
        edge.target,
        edge.targetTerminal,
      ]),
    ).toEqual([
      ['W1', 'B1', 'a', 'S1', 'a'],
      ['W2', 'S1', 'b', 'L1', 'a'],
    ])
  })

  it('converts the seed to the broken loop with B1.b and L1.b loose', () => {
    const netlist = toNetlist({ nodes: L1.seed.nodes, edges: L1.seed.edges })
    expect(netlist).toEqual({
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
        { id: 'S1', type: 'switch', closed: true, a: 'S1.a', b: 'S1.b' },
        { id: 'L1', type: 'bulb', a: 'L1.a', b: 'L1.b' },
        { id: 'W1', type: 'wire', a: 'B1.a', b: 'S1.a' },
        { id: 'W2', type: 'wire', a: 'S1.b', b: 'L1.a' },
      ],
    })
    const junctions = netlist.components.flatMap((component) => [component.a, component.b])
    expect(junctions.filter((junction) => junction === 'B1.b')).toHaveLength(1)
    expect(junctions.filter((junction) => junction === 'L1.b')).toHaveLength(1)
  })
})

describe('prediction engine', () => {
  it('labels every choice', () => {
    expect(CHOICE_LABELS).toEqual({ yes: 'Yes', no: 'No', not_sure: 'Not sure' })
  })

  it('requires a choice before proceeding', () => {
    expect(canProceed(null)).toBe(false)
    const choices: Choice[] = ['yes', 'no', 'not_sure']
    for (const choice of choices) {
      expect(canProceed(choice)).toBe(true)
    }
  })

  it('stores the choice and why alongside the lesson id', () => {
    expect(createPrediction('L1', 'no', 'The loop is broken')).toEqual({
      lessonId: 'L1',
      choice: 'no',
      why: 'The loop is broken',
    })
    expect(createPrediction('L1', 'not_sure', '')).toEqual({
      lessonId: 'L1',
      choice: 'not_sure',
      why: '',
    })
  })
})

function solved(
  components: Record<string, { voltage: number; current: number; power: number }>,
): SimulateResult {
  return {
    ok: true,
    node_voltages: {},
    components,
    error_code: null,
    error_message: '',
    component_ids: [],
  }
}

function rejected(): SimulateResult {
  return {
    ok: false,
    node_voltages: {},
    components: {},
    error_code: 'DANGLING_TERMINAL',
    error_message: 'loose ends',
    component_ids: ['B1', 'L1'],
  }
}

describe('L1 twist', () => {
  it('asks about the repaired circuit with the switch open', () => {
    expect(L1.twist.id).toBe('L1T1')
    expect(L1.twist.question).toBe(
      'You connect the missing wire but leave the switch open. Will the bulb light?',
    )
    expect(L1.twist.claim).toEqual({ type: 'lit', component: 'L1' })
  })

  it('starts from the same gap with S1 open', () => {
    expect(L1.twist.start).toEqual({
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
        { id: 'S1', type: 'switch', closed: false, a: 'p', b: 'm' },
        { id: 'L1', type: 'bulb', a: 'm', b: 'n1' },
      ],
    })
    expect(L1.twist.expectedStart).toEqual({
      ok: false,
      code: 'DANGLING_TERMINAL',
      component_ids: ['B1', 'L1'],
      lit: false,
    })
  })

  it('expects a valid but dark fixed circuit', () => {
    expect(L1.twist.fix.wire).toEqual({ a: 'n1', b: '0' })
    expect(L1.twist.expectedFixed).toEqual({
      ok: true,
      lit: false,
      component: 'L1',
      current: 0,
      power: 0,
    })
  })

  it('seeds the canvas with the open switch and two wires', () => {
    expect(L1.twist.seed.nodes.find((node) => node.id === 'S1')).toMatchObject({
      kind: 'switch',
      closed: false,
    })
    expect(L1.twist.seed.edges.map((edge) => edge.id)).toEqual(['W1', 'W2'])
  })

  it('converts the twist seed with B1.b and L1.b loose', () => {
    const netlist = toNetlist({ nodes: L1.twist.seed.nodes, edges: L1.twist.seed.edges })
    expect(netlist.components.find((component) => component.id === 'S1')).toMatchObject({
      type: 'switch',
      closed: false,
    })
    const junctions = netlist.components.flatMap((component) => [component.a, component.b])
    expect(junctions.filter((junction) => junction === 'B1.b')).toHaveLength(1)
    expect(junctions.filter((junction) => junction === 'L1.b')).toHaveLength(1)
  })
})

describe('completion and twist claims', () => {
  const lit: ExpectedFixed = { ok: true, lit: true, component: 'L1', current: 0.6, power: 3.6 }
  const dark: ExpectedFixed = { ok: true, lit: false, component: 'L1', current: 0, power: 0 }

  it('matches solver-accurate L1 numbers', () => {
    const result = solved({ L1: { voltage: 6, current: 0.6, power: 3.5999999999999996 } })
    expect(matchesExpected(result, lit)).toBe(true)
  })

  it('matches the dark twist numbers', () => {
    const result = solved({ L1: { voltage: 0, current: 0, power: 0 } })
    expect(matchesExpected(result, dark)).toBe(true)
  })

  it('unlocks the transfer only on the twist pack numbers', () => {
    const done = solved({ L1: { voltage: 0, current: 0, power: 0 } })
    expect(matchesExpected(done, L1.twist.expectedFixed)).toBe(true)
    const litResult = solved({ L1: { voltage: 6, current: 0.6, power: 3.6 } })
    expect(matchesExpected(litResult, L1.twist.expectedFixed)).toBe(false)
    expect(matchesExpected(rejected(), L1.twist.expectedFixed)).toBe(false)
  })

  it('rejects mismatched, missing, and failed results', () => {
    const litResult = solved({ L1: { voltage: 6, current: 0.6, power: 3.5999999999999996 } })
    expect(matchesExpected(litResult, dark)).toBe(false)
    const wrongPart = solved({ L2: { voltage: 6, current: 0.6, power: 3.6 } })
    expect(matchesExpected(wrongPart, lit)).toBe(false)
    expect(matchesExpected(rejected(), lit)).toBe(false)
    expect(matchesExpected(rejected(), dark)).toBe(false)
  })

  it('maps definite choices to lit claims', () => {
    expect(choiceToClaim('yes', { type: 'lit', component: 'L1' })).toEqual({
      type: 'lit',
      component: 'L1',
      value: true,
    })
    expect(choiceToClaim('no', { type: 'lit', component: 'L1' })).toEqual({
      type: 'lit',
      component: 'L1',
      value: false,
    })
  })

  it('maps Not sure and unsupported claims to no verdict', () => {
    expect(choiceToClaim('not_sure', { type: 'lit', component: 'L1' })).toBeNull()
    expect(choiceToClaim('yes', { type: 'compare_brightness', component: 'L1' })).toBeNull()
  })
})

describe('compareWithExpected', () => {
  it.each([
    ['yes', true, 'CONSISTENT'],
    ['no', false, 'CONSISTENT'],
    ['yes', false, 'CONTRADICTED'],
    ['no', true, 'CONTRADICTED'],
    ['not_sure', true, 'UNASSESSABLE'],
    ['not_sure', false, 'UNASSESSABLE'],
  ] as const)('choice %s against expected lit=%s is %s', (choice, expectedLit, status) => {
    expect(compareWithExpected(choice, expectedLit)).toBe(status)
  })
})
