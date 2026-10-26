import { describe, expect, it } from 'vitest'
import type { CanvasGraph } from './toNetlist'
import { junctionId, toNetlist } from './toNetlist'

function node(id: string, kind: string) {
  return { id, kind }
}

function edge(
  id: string,
  source: string,
  sourceTerminal: string,
  target: string,
  targetTerminal: string,
) {
  return { id, source, sourceTerminal, target, targetTerminal }
}

describe('toNetlist', () => {
  it('converts an empty canvas to an empty netlist', () => {
    expect(toNetlist({ nodes: [], edges: [] })).toEqual({ components: [] })
  })

  it('converts a lone battery with both terminals loose', () => {
    expect(toNetlist({ nodes: [node('B1', 'battery')], edges: [] })).toEqual({
      components: [{ id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' }],
    })
  })

  it('converts a closed loop exactly', () => {
    const graph: CanvasGraph = {
      nodes: [node('B1', 'battery'), node('L1', 'bulb')],
      edges: [
        edge('W1', 'B1', 'a', 'L1', 'a'),
        edge('W2', 'L1', 'b', 'B1', 'b'),
      ],
    }
    expect(toNetlist(graph)).toEqual({
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
        { id: 'L1', type: 'bulb', a: 'L1.a', b: 'L1.b' },
        { id: 'W1', type: 'wire', a: 'B1.a', b: 'L1.a' },
        { id: 'W2', type: 'wire', a: 'L1.b', b: 'B1.b' },
      ],
    })
  })

  it('converts parallel branches sharing junctions', () => {
    const graph: CanvasGraph = {
      nodes: [node('B1', 'battery'), node('L1', 'bulb'), node('L2', 'bulb')],
      edges: [
        edge('W1', 'B1', 'a', 'L1', 'a'),
        edge('W2', 'B1', 'a', 'L2', 'a'),
        edge('W3', 'L1', 'b', 'B1', 'b'),
        edge('W4', 'L2', 'b', 'B1', 'b'),
      ],
    }
    const result = toNetlist(graph)
    expect(result.components.map((comp) => comp.id)).toEqual([
      'B1',
      'L1',
      'L2',
      'W1',
      'W2',
      'W3',
      'W4',
    ])
    expect(result.components[4]).toEqual({ id: 'W2', type: 'wire', a: 'B1.a', b: 'L2.a' })
  })

  it('preserves loose terminals instead of repairing them', () => {
    const graph: CanvasGraph = {
      nodes: [node('B1', 'battery'), node('L1', 'bulb')],
      edges: [edge('W1', 'B1', 'a', 'L1', 'a')],
    }
    expect(toNetlist(graph)).toEqual({
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
        { id: 'L1', type: 'bulb', a: 'L1.a', b: 'L1.b' },
        { id: 'W1', type: 'wire', a: 'B1.a', b: 'L1.a' },
      ],
    })
  })

  it.each([
    ['null graph', null],
    ['missing lists', {}],
    ['non-array lists', { nodes: 'B1', edges: 7 }],
    ['null entries', { nodes: [null], edges: [null] }],
    ['non-record entries', { nodes: ['B1'], edges: ['W1'] }],
    ['empty ids', { nodes: [{ id: '', kind: 'bulb' }], edges: [] }],
    ['unknown kind', { nodes: [{ id: 'S1', kind: 'switch' }], edges: [] }],
  ])('never throws on malformed graphs: %s', (_label, graph) => {
    expect(() => toNetlist(graph as unknown as CanvasGraph)).not.toThrow()
  })

  it('skips edges with malformed references', () => {
    const graph = {
      nodes: [node('B1', 'battery'), node('L1', 'bulb')],
      edges: [
        edge('W1', 'B1', 'a', 'L1', 'a'),
        { id: 'W2', source: 'B1', target: 'L1' },
        edge('W3', 'B1', 'x', 'L1', 'a'),
        edge('W4', 'B9', 'a', 'L1', 'a'),
        edge('W5', 'B1', 'a', 'L9', 'a'),
        edge('', 'B1', 'a', 'L1', 'a'),
      ],
    }
    expect(toNetlist(graph as unknown as CanvasGraph)).toEqual({
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
        { id: 'L1', type: 'bulb', a: 'L1.a', b: 'L1.b' },
        { id: 'W1', type: 'wire', a: 'B1.a', b: 'L1.a' },
      ],
    })
  })

  it('keeps duplicate edges and nodes for the solver to judge', () => {
    const graph: CanvasGraph = {
      nodes: [node('B1', 'battery'), node('B1', 'battery')],
      edges: [
        edge('W1', 'B1', 'a', 'B1', 'b'),
        edge('W1', 'B1', 'a', 'B1', 'b'),
      ],
    }
    const result = toNetlist(graph)
    expect(result.components.filter((comp) => comp.id === 'B1')).toHaveLength(2)
    expect(result.components.filter((comp) => comp.id === 'W1')).toHaveLength(2)
  })

  it('is deterministic for the same input', () => {
    const graph: CanvasGraph = {
      nodes: [node('B1', 'battery'), node('L1', 'bulb')],
      edges: [edge('W1', 'B1', 'a', 'L1', 'a')],
    }
    expect(toNetlist(graph)).toEqual(toNetlist(graph))
  })

  it('does not mutate its input', () => {
    const graph: CanvasGraph = {
      nodes: [node('B1', 'battery'), node('L1', 'bulb')],
      edges: [edge('W1', 'B1', 'a', 'L1', 'a')],
    }
    const frozen = structuredClone(graph)
    deepFreeze(graph)
    toNetlist(graph)
    expect(graph).toEqual(frozen)
  })

  it('names junctions consistently', () => {
    expect(junctionId('B1', 'a')).toBe('B1.a')
    expect(junctionId('L12', 'b')).toBe('L12.b')
  })
})

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object') {
    return
  }
  Object.freeze(value)
  for (const entry of Object.values(value)) {
    deepFreeze(entry)
  }
}
