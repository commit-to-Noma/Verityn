/**
 * Canvas-to-netlist conversion: pure, deterministic, never throws.
 *
 * Each component terminal is a junction named `<componentId>.<a|b>`; each
 * wire edge becomes a `wire` component spanning its two junctions. Loose
 * terminals, shorts, and empty canvases pass through untouched so the
 * solver — never this module — judges them. Ground stays the solver's
 * convention (first battery's b terminal).
 */

import type { ApiComponent, Netlist } from '../api/client'

export interface CanvasNodeInput {
  id: string
  kind: string
  closed?: boolean
}

export interface CanvasEdgeInput {
  id: string
  source: string
  sourceTerminal: string
  target: string
  targetTerminal: string
}

export interface CanvasGraph {
  nodes: CanvasNodeInput[]
  edges: CanvasEdgeInput[]
}

export const BATTERY_VOLTS = 6

export function junctionId(componentId: string, terminal: string): string {
  return `${componentId}.${terminal}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function toNetlist(graph: CanvasGraph): Netlist {
  const nodesRaw = isRecord(graph) && Array.isArray(graph.nodes) ? graph.nodes : []
  const edgesRaw = isRecord(graph) && Array.isArray(graph.edges) ? graph.edges : []
  const known = new Set<string>()
  for (const entry of nodesRaw) {
    if (isRecord(entry) && isNonEmptyString(entry.id)) {
      known.add(entry.id)
    }
  }
  const components: ApiComponent[] = []
  for (const entry of nodesRaw) {
    if (!isRecord(entry) || !isNonEmptyString(entry.id)) {
      continue
    }
    if (entry.kind !== 'battery' && entry.kind !== 'bulb' && entry.kind !== 'switch') {
      continue
    }
    if (entry.kind === 'switch' && typeof entry.closed !== 'boolean') {
      continue
    }
    const kind = entry.kind as 'battery' | 'bulb' | 'switch'
    const id = entry.id
    const junctions = { a: junctionId(id, 'a'), b: junctionId(id, 'b') }
    if (kind === 'battery') {
      components.push({ id, type: 'battery', volts: BATTERY_VOLTS, ...junctions })
    } else if (kind === 'switch') {
      components.push({ id, type: 'switch', closed: entry.closed as boolean, ...junctions })
    } else {
      components.push({ id, type: 'bulb', ...junctions })
    }
  }
  for (const entry of edgesRaw) {
    if (!isRecord(entry)) {
      continue
    }
    const { id, source, target, sourceTerminal, targetTerminal } = entry
    if (
      !isNonEmptyString(id) ||
      !isNonEmptyString(source) ||
      !isNonEmptyString(target) ||
      (sourceTerminal !== 'a' && sourceTerminal !== 'b') ||
      (targetTerminal !== 'a' && targetTerminal !== 'b') ||
      !known.has(source) ||
      !known.has(target)
    ) {
      continue
    }
    components.push({
      id,
      type: 'wire',
      a: junctionId(source, sourceTerminal),
      b: junctionId(target, targetTerminal),
    })
  }
  return { components }
}
