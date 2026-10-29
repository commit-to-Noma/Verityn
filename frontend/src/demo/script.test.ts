import { describe, expect, test } from 'vitest'
import { toNetlist } from '../canvas/toNetlist'
import { L1 } from '../lessons/l1'
import { TRANSFER } from '../lessons/transfer'
import { DEMO_SCRIPT, validateDemoScript } from './script'

describe('validateDemoScript', () => {
  test('the shipped script names real lesson content only', () => {
    expect(validateDemoScript(DEMO_SCRIPT)).toEqual([])
  })

  test('rejects an invalid prediction choice', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      firstPrediction: { ...DEMO_SCRIPT.firstPrediction, choice: 'maybe' as never },
    })
    expect(problems.some((problem) => problem.includes('firstPrediction'))).toBe(true)
  })

  test('rejects a prediction for the wrong lesson', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      soloPrediction: { ...DEMO_SCRIPT.soloPrediction, lessonId: 'L1' },
    })
    expect(problems.some((problem) => problem.includes('soloPrediction'))).toBe(true)
  })

  test('rejects an empty why line', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      realityPrediction: { ...DEMO_SCRIPT.realityPrediction, why: '   ' },
    })
    expect(problems.some((problem) => problem.includes('realityPrediction'))).toBe(true)
  })

  test('rejects a build connection to an unknown node', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      l1Build: { connections: [{ source: 'B9', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' }] },
    })
    expect(problems.some((problem) => problem.includes('B9'))).toBe(true)
  })

  test('rejects a build connection that is already wired', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      l1Build: { connections: [{ source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' }] },
    })
    expect(problems.some((problem) => problem.includes('already wired'))).toBe(true)
  })

  test('rejects a demonstration outside the closed vocabulary', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      demonstration: { action: 'rewire_everything', target: 'S1' },
    })
    expect(problems.some((problem) => problem.includes('closed vocabulary'))).toBe(true)
  })

  test('rejects a demonstration targeting a non-switch', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      demonstration: { action: 'close_switch', target: 'L1' },
    })
    expect(problems.some((problem) => problem.includes('not a switch'))).toBe(true)
  })

  test('rejects unknown script sections (no solo coach directives)', () => {
    const problems = validateDemoScript({
      ...DEMO_SCRIPT,
      soloCoach: { rung: 'R1' },
    } as never)
    expect(problems.some((problem) => problem.includes('unknown script section'))).toBe(true)
    expect(Object.keys(DEMO_SCRIPT).sort()).toEqual([
      'demonstration',
      'firstPrediction',
      'l1Build',
      'realityPrediction',
      'soloBuild',
      'soloPrediction',
    ])
  })
})

describe('scripted builds produce the real repair netlist', () => {
  test('L1 demo wire closes the open seed through the normal converter', () => {
    const netlist = toNetlist({
      nodes: L1.seed.nodes.map((node) => ({ id: node.id, kind: node.kind, closed: node.closed })),
      edges: [
        ...L1.seed.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          sourceTerminal: edge.sourceTerminal,
          target: edge.target,
          targetTerminal: edge.targetTerminal,
        })),
        { id: 'W3', source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    })
    const wires = netlist.components.filter((part) => part.type === 'wire')
    expect(wires).toHaveLength(L1.seed.edges.length + 1)
    expect(wires[wires.length - 1]).toMatchObject({ a: 'B1.b', b: 'L1.b' })
  })

  test('solo demo wire closes the transfer seed through the normal converter', () => {
    const netlist = toNetlist({
      nodes: TRANSFER.seed.nodes.map((node) => ({ id: node.id, kind: node.kind, closed: node.closed })),
      edges: [
        ...TRANSFER.seed.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          sourceTerminal: edge.sourceTerminal,
          target: edge.target,
          targetTerminal: edge.targetTerminal,
        })),
        { id: 'W5', source: 'L2', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    })
    const wires = netlist.components.filter((part) => part.type === 'wire')
    expect(wires).toHaveLength(TRANSFER.seed.edges.length + 1)
    expect(wires[wires.length - 1]).toMatchObject({ a: 'L2.b', b: 'L1.b' })
  })
})
