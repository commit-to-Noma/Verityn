/** Solo result summary, derived only from recorded evidence.
 *
 * The prediction line restates the learner's recorded choice about the
 * claimed bulb; the change line diffs built edges against the seed;
 * measurements come from the solved result; the suggestion reads the
 * bulb states. Nothing here judges the learner or claims transfer.
 */

import type { Netlist, SimulateResult } from '../api/client'
import { LIT_POWER_W, type LessonSeed } from '../lessons/lesson'

export interface SoloBulbReading {
  id: string
  label: string
  current: number
  power: number
  lit: boolean
}

export interface BuiltEdge {
  source: string
  sourceTerminal: string
  target: string
  targetTerminal: string
}

const PART_NAMES: Record<string, string> = {
  battery: 'battery',
  bulb: 'bulb',
  switch: 'switch',
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth']

function partName(id: string, seed: LessonSeed): string {
  const node = seed.nodes.find((candidate) => candidate.id === id)
  if (node === undefined) {
    return 'circuit part'
  }
  const name = PART_NAMES[node.kind] ?? 'circuit part'
  const matchingParts = seed.nodes.filter((candidate) => candidate.kind === node.kind)
  if (matchingParts.length === 1) {
    return name
  }
  const suffix = /^([A-Z]+)(\d+)$/.exec(id)
  const index =
    suffix === null
      ? matchingParts.findIndex((candidate) => candidate.id === id)
      : Number(suffix[2]) - 1
  return `${ORDINALS[index] ?? 'next'} ${name}`
}

function connectionDot(id: string, terminal: string, seed: LessonSeed): string {
  const side = terminal === 'a' ? 'left' : terminal === 'b' ? 'right' : null
  return side === null ? 'a loose connection dot' : `the ${partName(id, seed)}'s ${side} dot`
}

/** The recorded prediction in plain words, naming the claimed bulb. */
export function soloPredictionLine(
  choice: 'yes' | 'no' | 'not_sure',
  component: string,
): string {
  if (choice === 'yes') {
    return `You predicted that the ${component} would light.`
  }
  if (choice === 'no') {
    return `You predicted that the ${component} would stay dark.`
  }
  return `You were not sure whether the ${component} would light.`
}

function edgeKey(source: string, sourceTerminal: string, target: string, targetTerminal: string): string {
  const ends = [`${source}.${sourceTerminal}`, `${target}.${targetTerminal}`].sort()
  return ends.join('-')
}

/** What the learner added, as wires beyond the starting seed. */
export function describeAddedWires(seed: LessonSeed, built: BuiltEdge[]): string {
  const seeded = new Set(
    seed.edges.map((edge) =>
      edgeKey(edge.source, edge.sourceTerminal, edge.target, edge.targetTerminal),
    ),
  )
  const added = built.filter(
    (edge) =>
      !seeded.has(edgeKey(edge.source, edge.sourceTerminal, edge.target, edge.targetTerminal)),
  )
  if (added.length === 0) {
    return 'No new connections yet.'
  }
  const lines = added.map(
    (edge) =>
      `${connectionDot(edge.source, edge.sourceTerminal, seed)} to ${connectionDot(
        edge.target,
        edge.targetTerminal,
        seed,
      )}`,
  )
  if (lines.length === 1) {
    return `You connected ${lines[0]}.`
  }
  return `You connected ${lines.slice(0, -1).join(', ')}, and ${lines[lines.length - 1]}.`
}

/** Per-bulb readings in netlist order; missing readings read as zero. */
export function soloBulbReadings(result: SimulateResult, netlist: Netlist): SoloBulbReading[] {
  const bulbs = netlist.components.filter((part) => part.type === 'bulb')
  return bulbs.map((part, index) => {
    const reading = result.ok ? result.components[part.id] : undefined
    const power = reading?.power ?? 0
    return {
      id: part.id,
      label: bulbs.length === 1 ? 'bulb' : `${ORDINALS[index] ?? 'next'} bulb`,
      current: reading?.current ?? 0,
      power,
      lit: power > LIT_POWER_W,
    }
  })
}

/** What the bulb states suggest, stated as circuit facts only. */
export function soloSuggestion(readings: SoloBulbReading[]): string {
  const dark = readings.filter((reading) => !reading.lit).map((reading) => reading.id)
  if (dark.length === 0 && readings.length > 0) {
    if (readings.length === 1) {
      return 'The bulb is lit. It has a complete path, so current reaches it.'
    }
    const names = readings.map((reading) => `the ${reading.label}`).join(' and ')
    return `${names[0]?.toUpperCase()}${names.slice(1)} are lit. Each bulb has a complete path, so current reaches each one.`
  }
  if (dark.length === 1) {
    const reading = readings.find((item) => item.id === dark[0])
    return `The ${reading?.label ?? 'bulb'} stays dark in the circuit you built. Check how its dots are connected.`
  }
  if (dark.length > 1) {
    const names = readings
      .filter((reading) => !reading.lit)
      .map((reading) => `the ${reading.label}`)
      .join(' and ')
    return `${names} stay dark in the circuit you built. Check how their dots are connected.`
  }
  return 'No bulbs are in this circuit yet.'
}
