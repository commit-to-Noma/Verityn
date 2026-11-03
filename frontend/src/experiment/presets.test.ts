import { describe, expect, it } from 'vitest'
import { toNetlist } from '../canvas/toNetlist'
import { EXPERIMENT_PRESETS } from './presets'

describe('EXPERIMENT_PRESETS', () => {
  it('offers the six documented starters with prompts', () => {
    expect(EXPERIMENT_PRESETS.map((preset) => preset.id)).toEqual([
      'light-bulb',
      'polarity-duel',
      'time-bomb',
      'dim-duo',
      'shorted-battery',
      'overload-bulb',
    ])
    for (const preset of EXPERIMENT_PRESETS) {
      expect(preset.title.length).toBeGreaterThan(0)
      expect(preset.tagline.length).toBeGreaterThan(0)
      expect(preset.prompt.length).toBeGreaterThan(0)
      expect(preset.expected.length).toBeGreaterThan(0)
    }
  })

  it('converts every seed through the shared converter', () => {
    for (const preset of EXPERIMENT_PRESETS) {
      const netlist = toNetlist({ nodes: preset.seed.nodes, edges: preset.seed.edges })
      const byId = new Map(netlist.components.map((part) => [part.id, part]))
      // Every seed node survives with solver-compatible terminals.
      for (const node of preset.seed.nodes) {
        const part = byId.get(node.id)
        expect(part).toBeDefined()
        expect(['battery', 'bulb', 'switch']).toContain(part?.type)
      }
      // Every seed edge references known endpoints.
      for (const edge of preset.seed.edges) {
        expect(byId.has(edge.source)).toBe(true)
        expect(byId.has(edge.target)).toBe(true)
      }
    }
  })

  it('wires the closed loop, the duel, the bomb, the dim duo, and the short', () => {
    const nets = new Map(
      EXPERIMENT_PRESETS.map((preset) => [
        preset.id,
        toNetlist({ nodes: preset.seed.nodes, edges: preset.seed.edges }),
      ]),
    )
    const closed = nets.get('light-bulb')?.components.find((part) => part.id === 'S1')
    expect(closed).toMatchObject({ type: 'switch', closed: true })
    const duel = nets.get('polarity-duel')
    expect(
      duel?.components.filter((part) => part.type === 'battery').map((part) => part.id).sort(),
    ).toEqual(['B1', 'B2'])
    // The batteries share their b terminals and push from opposite a ends.
    expect(duel?.components.find((part) => part.id === 'W1')).toMatchObject({
      type: 'wire',
      a: 'B1.b',
      b: 'B2.b',
    })
    expect(duel?.components.find((part) => part.id === 'W4')).toMatchObject({
      type: 'wire',
      a: 'L1.b',
      b: 'B2.a',
    })
    const bomb = nets.get('time-bomb')
    expect(bomb?.components.find((part) => part.id === 'B1')).toMatchObject({
      type: 'battery',
      volts: 24,
    })
    expect(bomb?.components.find((part) => part.id === 'S1')).toMatchObject({
      type: 'switch',
      closed: true,
    })
    const duo = nets.get('dim-duo')?.components.filter((part) => part.type === 'bulb')
    expect(duo?.map((part) => part.id).sort()).toEqual(['L1', 'L2'])
    expect(
      nets.get('dim-duo')?.components.filter((part) => part.type === 'wire'),
    ).toHaveLength(3)
    const short = nets.get('shorted-battery')?.components.find((part) => part.id === 'W1')
    expect(short).toMatchObject({ type: 'wire', a: 'B1.a', b: 'B1.b' })
  })

  it('seeds the overwork bench with an unrated bulb and an 18 V battery', () => {
    const netlist = toNetlist({
      nodes: EXPERIMENT_PRESETS.find((preset) => preset.id === 'overload-bulb')?.seed.nodes ?? [],
      edges: EXPERIMENT_PRESETS.find((preset) => preset.id === 'overload-bulb')?.seed.edges ?? [],
    })
    const byId = new Map(netlist.components.map((part) => [part.id, part]))
    expect(byId.get('B1')).toMatchObject({ type: 'battery', volts: 18 })
    expect(byId.get('S1')).toMatchObject({ type: 'switch', closed: true })
    // No per-bulb ratings: the classroom 12 V / 14.4 W defaults apply.
    expect(byId.get('L1')).toMatchObject({ type: 'bulb' })
    expect(byId.get('L1')).not.toHaveProperty('rated_volts')
    expect(byId.get('L1')).not.toHaveProperty('max_safe_watts')
  })

  it('uses stable unique ids within each seed', () => {
    for (const preset of EXPERIMENT_PRESETS) {
      const ids = [...preset.seed.nodes.map((node) => node.id), ...preset.seed.edges.map((edge) => edge.id)]
      expect(new Set(ids).size).toBe(ids.length)
      expect(toNetlist({ nodes: preset.seed.nodes, edges: preset.seed.edges })).toEqual(
        toNetlist({ nodes: preset.seed.nodes, edges: preset.seed.edges }),
      )
    }
  })
})
