import { describe, expect, it } from 'vitest'
import { toNetlist } from '../canvas/toNetlist'
import { EXPERIMENT_PRESETS } from './presets'

describe('EXPERIMENT_PRESETS', () => {
  it('offers the four documented starters with prompts', () => {
    expect(EXPERIMENT_PRESETS.map((preset) => preset.id)).toEqual([
      'light-bulb',
      'open-switch',
      'series-pair',
      'shorted-battery',
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

  it('wires the closed loop, the open switch, the series pair, and the short', () => {
    const nets = new Map(
      EXPERIMENT_PRESETS.map((preset) => [
        preset.id,
        toNetlist({ nodes: preset.seed.nodes, edges: preset.seed.edges }),
      ]),
    )
    const closed = nets.get('light-bulb')?.components.find((part) => part.id === 'S1')
    expect(closed).toMatchObject({ type: 'switch', closed: true })
    const open = nets.get('open-switch')?.components.find((part) => part.id === 'S1')
    expect(open).toMatchObject({ type: 'switch', closed: false })
    expect(
      nets.get('open-switch')?.components.filter((part) => part.type === 'wire'),
    ).toHaveLength(3)
    const series = nets.get('series-pair')?.components.filter((part) => part.type === 'bulb')
    expect(series?.map((part) => part.id).sort()).toEqual(['L1', 'L2'])
    expect(
      nets.get('series-pair')?.components.filter((part) => part.type === 'switch'),
    ).toHaveLength(0)
    const short = nets.get('shorted-battery')?.components.find((part) => part.id === 'W1')
    expect(short).toMatchObject({ type: 'wire', a: 'B1.a', b: 'B1.b' })
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
