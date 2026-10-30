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

/** The recorded prediction in plain words, naming the claimed bulb. */
export function soloPredictionLine(
  choice: 'yes' | 'no' | 'not_sure',
  component: string,
): string {
  if (choice === 'yes') {
    return `You predicted that ${component} would light.`
  }
  if (choice === 'no') {
    return `You predicted that ${component} would stay dark.`
  }
  return `You were not sure whether ${component} would light.`
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
  const lines = added.map((edge) => `${edge.source}.${edge.sourceTerminal} to ${edge.target}.${edge.targetTerminal}`)
  if (lines.length === 1) {
    return `You connected ${lines[0]}.`
  }
  return `You connected ${lines.slice(0, -1).join(', ')}, and ${lines[lines.length - 1]}.`
}

/** Per-bulb readings in netlist order; missing readings read as zero. */
export function soloBulbReadings(result: SimulateResult, netlist: Netlist): SoloBulbReading[] {
  return netlist.components
    .filter((part) => part.type === 'bulb')
    .map((part) => {
      const reading = result.ok ? result.components[part.id] : undefined
      const power = reading?.power ?? 0
      return {
        id: part.id,
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
    const names =
      readings.length === 1
        ? readings[0].id
        : `${readings
            .slice(0, -1)
            .map((reading) => reading.id)
            .join(', ')} and ${readings[readings.length - 1].id}`
    const are = readings.length === 1 ? 'is' : 'are'
    return `${names} ${are} each lit: every bulb is part of a complete path, so current reaches each one.`
  }
  if (dark.length === 1) {
    return `${dark[0]} stays dark in the circuit you built. Trace where its terminals connect.`
  }
  if (dark.length > 1) {
    return `${dark.join(' and ')} stay dark in the circuit you built. Trace where their terminals connect.`
  }
  return 'No bulbs are in this circuit yet.'
}
