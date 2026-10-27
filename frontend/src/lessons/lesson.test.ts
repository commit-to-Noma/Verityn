import { describe, expect, it } from 'vitest'
import { toNetlist } from '../canvas/toNetlist'
import { L1 } from './l1'
import type { Choice } from './lesson'
import { canProceed, CHOICE_LABELS, createPrediction } from './lesson'

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
