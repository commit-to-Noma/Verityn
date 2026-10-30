import type { Netlist } from '../api/client'
import type { LessonSeed, SeedEdge, SeedNode } from '../lessons/lesson'

function splitJunction(junction: string): { node: string; terminal: 'a' | 'b' } | null {
  const separator = junction.lastIndexOf('.')
  if (separator <= 0) {
    return null
  }
  const node = junction.slice(0, separator)
  const terminal = junction.slice(separator + 1)
  if (terminal !== 'a' && terminal !== 'b') {
    return null
  }
  return { node, terminal }
}

/** Rebuild a readable diagram from the exact component and wire topology that was solved. */
export function netlistPreviewSeed(netlist: Netlist): LessonSeed | null {
  const parts = netlist.components.filter((component) => component.type !== 'wire')
  if (
    parts.length === 0 ||
    parts.some(
      (component) =>
        component.type !== 'battery' &&
        component.type !== 'bulb' &&
        component.type !== 'switch',
    )
  ) {
    return null
  }

  const nodes: SeedNode[] = parts.map((component, index) => ({
    id: component.id,
    kind: component.type,
    closed: component.type === 'switch' ? component.closed : undefined,
    volts: component.type === 'battery' ? component.volts : undefined,
    ratedVolts: component.type === 'bulb' ? component.rated_volts : undefined,
    maxSafeWatts: component.type === 'bulb' ? component.max_safe_watts : undefined,
    x: 80 + (index % 3) * 210,
    y: 80 + Math.floor(index / 3) * 170,
  }))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges: SeedEdge[] = []

  for (const wire of netlist.components.filter((component) => component.type === 'wire')) {
    const source = splitJunction(wire.a)
    const target = splitJunction(wire.b)
    if (
      source === null ||
      target === null ||
      !nodeIds.has(source.node) ||
      !nodeIds.has(target.node)
    ) {
      return null
    }
    edges.push({
      id: wire.id,
      source: source.node,
      sourceTerminal: source.terminal,
      target: target.node,
      targetTerminal: target.terminal,
    })
  }

  return { nodes, edges }
}
