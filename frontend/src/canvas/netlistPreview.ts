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

interface WireEnds {
  id: string
  source: { node: string; terminal: 'a' | 'b' }
  target: { node: string; terminal: 'a' | 'b' }
}

/**
 * Order parts by walking the solved loop from the battery, so consecutive
 * parts are wired together. Deterministic: ties follow netlist wire order,
 * and unreached parts keep their netlist order at the end.
 */
export function loopOrderPartIds(
  partIds: string[],
  wires: WireEnds[],
  batteryId: string | null,
): string[] {
  const neighbours = new Map<string, string[]>()
  for (const wire of wires) {
    for (const [from, to] of [
      [wire.source.node, wire.target.node],
      [wire.target.node, wire.source.node],
    ] as const) {
      if (from === to) {
        continue
      }
      const list = neighbours.get(from) ?? []
      if (!list.includes(to)) {
        list.push(to)
      }
      neighbours.set(from, list)
    }
  }
  const start = batteryId !== null && partIds.includes(batteryId) ? batteryId : partIds[0]
  if (start === undefined) {
    return []
  }
  const ordered = [start]
  const seen = new Set([start])
  let current = start
  for (;;) {
    const next = (neighbours.get(current) ?? []).find((id) => !seen.has(id))
    if (next === undefined) {
      break
    }
    seen.add(next)
    ordered.push(next)
    current = next
  }
  for (const id of partIds) {
    if (!seen.has(id)) {
      ordered.push(id)
    }
  }
  return ordered
}

const PREVIEW_X_STEP = 260
const PREVIEW_Y_STEP = 210

/**
 * Perimeter slots of a two-column grid in loop order: walking the slots
 * visits grid-adjacent cells, so loop neighbours sit side by side and
 * only the closing wire spans the diagram (through empty middle space).
 */
export function perimeterSlots(count: number): Array<{ col: number; row: number }> {
  if (count <= 0) {
    return []
  }
  const rows = Math.max(1, Math.ceil(count / 2))
  const slots: Array<{ col: number; row: number }> = [{ col: 0, row: 0 }]
  if (count === 1) {
    return slots
  }
  slots.push({ col: 1, row: 0 })
  for (let row = 1; row < rows; row++) {
    slots.push({ col: 1, row })
  }
  for (let row = rows - 1; row >= 1; row--) {
    slots.push({ col: 0, row })
  }
  return slots.slice(0, count)
}

/** Rebuild a readable diagram from the exact component and wire topology that was solved. */
export function netlistPreviewSeed(
  netlist: Netlist,
  positions?: Record<string, { x: number; y: number }>,
): LessonSeed | null {
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

  const nodeIds = new Set(parts.map((part) => part.id))
  const wires: WireEnds[] = []
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
    wires.push({ id: wire.id, source, target })
  }
  const battery = parts.find((part) => part.type === 'battery') ?? null
  const orderedIds = loopOrderPartIds(
    parts.map((part) => part.id),
    wires,
    battery?.id ?? null,
  )
  const slots = perimeterSlots(orderedIds.length)
  const hasSavedPositions = orderedIds.every(
    (id) =>
      Number.isFinite(positions?.[id]?.x) &&
      Number.isFinite(positions?.[id]?.y),
  )
  const byId = new Map(parts.map((part) => [part.id, part]))
  const nodes: SeedNode[] = orderedIds.map((id, index) => {
    const component = byId.get(id)
    if (component === undefined) {
      throw new Error(`Preview lost part ${id}`)
    }
    const slot = slots[index] ?? { col: 0, row: 0 }
    const savedPosition = hasSavedPositions ? positions?.[id] : undefined
    return {
      id: component.id,
      kind: component.type,
      closed: component.type === 'switch' ? component.closed : undefined,
      volts: component.type === 'battery' ? component.volts : undefined,
      ratedVolts: component.type === 'bulb' ? component.rated_volts : undefined,
      maxSafeWatts: component.type === 'bulb' ? component.max_safe_watts : undefined,
      x: savedPosition?.x ?? 80 + slot.col * PREVIEW_X_STEP,
      y: savedPosition?.y ?? 80 + slot.row * PREVIEW_Y_STEP,
    }
  })
  const edges: SeedEdge[] = wires.map((wire) => ({
    id: wire.id,
    source: wire.source.node,
    sourceTerminal: wire.source.terminal,
    target: wire.target.node,
    targetTerminal: wire.target.terminal,
  }))

  return { nodes, edges }
}
