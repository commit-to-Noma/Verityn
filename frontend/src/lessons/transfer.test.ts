import { describe, expect, it } from 'vitest'
import { toNetlist } from '../canvas/toNetlist'
import { TRANSFER } from './transfer'

/** Outcome words the hint must never contain, matched on word boundaries. */
const ANSWER_WORDS = /\b(yes|no|lit|dark|light|lights|parallel|series|short)\b/i

describe('Transfer pack', () => {
  it('identifies the solo second-bulb challenge', () => {
    expect(TRANSFER.id).toBe('L1T2')
    expect(TRANSFER.title).toBe('Solo: the second bulb')
    expect(TRANSFER.question).toBe(
      "You wire a second bulb across the first bulb's terminals. Will the second bulb light?",
    )
    expect(TRANSFER.claim).toEqual({ type: 'lit', component: 'L2' })
  })

  it('seeds a working loop plus a half-wired second bulb', () => {
    expect(TRANSFER.seed.nodes.map((node) => [node.id, node.kind])).toEqual([
      ['B1', 'battery'],
      ['S1', 'switch'],
      ['L1', 'bulb'],
      ['L2', 'bulb'],
    ])
    expect(TRANSFER.seed.nodes.find((node) => node.id === 'S1')?.closed).toBe(true)
    expect(TRANSFER.seed.edges.map((edge) => edge.id)).toEqual(['W1', 'W2', 'W3', 'W4'])
  })

  it('converts the seed to the expected canvas netlist shape', () => {
    const netlist = toNetlist({ nodes: TRANSFER.seed.nodes, edges: TRANSFER.seed.edges })
    expect(netlist.components.map((component) => [component.id, component.type])).toEqual([
      ['B1', 'battery'],
      ['S1', 'switch'],
      ['L1', 'bulb'],
      ['L2', 'bulb'],
      ['W1', 'wire'],
      ['W2', 'wire'],
      ['W3', 'wire'],
      ['W4', 'wire'],
    ])
  })

  it('keeps the hint free of answers', () => {
    expect(TRANSFER.fix.hint).not.toMatch(ANSWER_WORDS)
    expect(TRANSFER.fix.hint.length).toBeGreaterThan(0)
  })

  it('stores solver-verified expectations, not guesses', () => {
    expect(TRANSFER.expectedStart).toMatchObject({ ok: false, lit: false })
    expect(TRANSFER.expectedFixed).toMatchObject({ ok: true, lit: true, component: 'L2' })
  })
})
