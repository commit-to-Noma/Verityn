/** Deterministic layout for vision-proposed circuits on the canvas.
 *
 * Proposal connections become canvas edges (V-prefixed ids, never
 * colliding with learner-placed Wires); node positions follow a fixed
 * grid so the same proposal always lands identically. Uncertain edge
 * ids pass through for dashed styling. Pure and fully tested.
 */

import type { VisionProposal } from '../api/client'
import type { LessonSeed } from '../lessons/lesson'

export interface ProposalLayout {
  seed: LessonSeed
  uncertainIds: string[]
}

export interface CanvasImportRequest {
  seed: LessonSeed
  uncertainIds: string[]
  nonce: number
}

/** Highest numeric id suffix per part kind, so imports never collide. */
export function counterStarts(nodes: { id: string }[]): {
  battery: number
  bulb: number
  switch: number
} {
  const next = { battery: 0, bulb: 0, switch: 0 }
  for (const node of nodes) {
    const match = /^(B|L|S)(\d+)$/.exec(node.id)
    if (!match?.[1] || !match[2]) {
      continue
    }
    const kind = match[1] === 'B' ? 'battery' : match[1] === 'L' ? 'bulb' : 'switch'
    next[kind] = Math.max(next[kind], parseInt(match[2], 10))
  }
  return next
}

const COLUMNS = 3
const ORIGIN_X = 60
const ORIGIN_Y = 140
const STEP_X = 190
const STEP_Y = 160

/** Place proposal parts on a grid and name its wires V1..Vn. */
export function layoutProposal(proposal: VisionProposal): ProposalLayout {
  const seed: LessonSeed = {
    nodes: proposal.components.map((component, index) => ({
      id: component.id,
      kind: component.type,
      closed: component.type === 'switch' ? (component.closed ?? true) : undefined,
      x: ORIGIN_X + (index % COLUMNS) * STEP_X,
      y: ORIGIN_Y + Math.floor(index / COLUMNS) * STEP_Y,
    })),
    edges: proposal.connections.map((connection, index) => ({
      id: `V${index + 1}`,
      source: connection.from.node,
      sourceTerminal: connection.from.terminal,
      target: connection.to.node,
      targetTerminal: connection.to.terminal,
    })),
  }
  const uncertainIds = proposal.connections
    .map((connection, index) => (connection.uncertain ? `V${index + 1}` : null))
    .filter((id): id is string => id !== null)
  return { seed, uncertainIds }
}
