import { describe, expect, test } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import { TRANSFER } from '../lessons/transfer'
import {
  describeAddedWires,
  soloBulbReadings,
  soloPredictionLine,
  soloSuggestion,
} from './summary'

const NETLIST: Netlist = {
  components: [
    { id: 'B1', type: 'battery', a: 'p', b: '0', volts: 6 },
    { id: 'L1', type: 'bulb', a: 'm', b: '0' },
    { id: 'L2', type: 'bulb', a: 'm', b: '0' },
  ],
}

const LIT_RESULT = {
  ok: true,
  components: {
    L1: { volts: 6, current: 0.6, power: 3.6 },
    L2: { volts: 6, current: 0.6, power: 3.6 },
  },
} as unknown as SimulateResult

describe('soloPredictionLine', () => {
  test('restates the recorded choice about the claimed bulb', () => {
    expect(soloPredictionLine('yes', 'L2')).toBe('You predicted that L2 would light.')
    expect(soloPredictionLine('no', 'L2')).toBe('You predicted that L2 would stay dark.')
    expect(soloPredictionLine('not_sure', 'L2')).toBe('You were not sure whether L2 would light.')
  })
})

describe('describeAddedWires', () => {
  const seedEdges = TRANSFER.seed.edges.map((edge) => ({
    source: edge.source,
    sourceTerminal: edge.sourceTerminal,
    target: edge.target,
    targetTerminal: edge.targetTerminal,
  }))

  test('names the added repair wire', () => {
    expect(
      describeAddedWires(TRANSFER.seed, [
        ...seedEdges,
        { source: 'L2', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ]),
    ).toBe('You connected L2.b to L1.b.')
  })

  test('ignores seed wires in either direction', () => {
    expect(describeAddedWires(TRANSFER.seed, [...seedEdges].reverse())).toBe(
      'No new connections yet.',
    )
  })

  test('reports honestly when nothing was added', () => {
    expect(describeAddedWires(TRANSFER.seed, [])).toBe('No new connections yet.')
  })
})

describe('soloBulbReadings', () => {
  test('reads every bulb in netlist order', () => {
    expect(soloBulbReadings(LIT_RESULT, NETLIST)).toEqual([
      { id: 'L1', current: 0.6, power: 3.6, lit: true },
      { id: 'L2', current: 0.6, power: 3.6, lit: true },
    ])
  })

  test('missing readings read as zero and dark', () => {
    const partial = {
      ok: true,
      components: { L1: { volts: 6, current: 0.6, power: 3.6 } },
    } as unknown as SimulateResult
    expect(soloBulbReadings(partial, NETLIST)[1]).toEqual({
      id: 'L2',
      current: 0,
      power: 0,
      lit: false,
    })
  })
})

describe('soloSuggestion', () => {
  test('states the complete path when every bulb is lit', () => {
    expect(
      soloSuggestion([
        { id: 'L1', current: 0.6, power: 3.6, lit: true },
        { id: 'L2', current: 0.6, power: 3.6, lit: true },
      ]),
    ).toBe(
      'L1 and L2 are each lit: every bulb is part of a complete path, so current reaches each one.',
    )
  })

  test('names the dark bulb and where to look', () => {
    expect(
      soloSuggestion([
        { id: 'L1', current: 0.6, power: 3.6, lit: true },
        { id: 'L2', current: 0, power: 0, lit: false },
      ]),
    ).toBe('L2 stays dark in the circuit you built. Trace where its terminals connect.')
  })
})
