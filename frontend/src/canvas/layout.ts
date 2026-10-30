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

/** Natural image size in pixels, used to preserve aspect in mapping. */
export interface ImageGeometry {
  width: number
  height: number
}

/** Replica work area: mapped positions stay inside this box. */
const MAP_MAX_W = 640
const MAP_MAX_H = 440
const MAP_MARGIN = 80

/** Map normalized evidence centers into canvas coordinates, preserving aspect.
 *
 * The source image aspect (width/height) sets the work-area shape; uniform
 * scale fits it inside the max box and centers it. Deterministic: the same
 * proposal and geometry always land identically. Rotation is not mapped  - 
 * canvas parts are axis-aligned  -  and wire routes are reconstructed
 * orthogonal edges between the established terminals, never traced paths.
 */
export function geometryPositions(
  proposal: VisionProposal,
  image: ImageGeometry,
): Record<string, { x: number; y: number }> {
  const safeW = image.width > 0 ? image.width : 1
  const safeH = image.height > 0 ? image.height : 1
  const scale = Math.min(MAP_MAX_W / safeW, MAP_MAX_H / safeH)
  const areaW = safeW * scale
  const areaH = safeH * scale
  const offX = MAP_MARGIN + (MAP_MAX_W - areaW) / 2
  const offY = MAP_MARGIN + (MAP_MAX_H - areaH) / 2
  const positions: Record<string, { x: number; y: number }> = {}
  for (const component of proposal.components) {
    const bounds = component.evidence.bounds
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    positions[component.id] = {
      x: Math.round(offX + cx * areaW),
      y: Math.round(offY + cy * areaH),
    }
  }
  return positions
}

/** Place proposal parts from image geometry; grid fallback keeps old callers. */
export function layoutProposalFromGeometry(
  proposal: VisionProposal,
  image: ImageGeometry,
): ProposalLayout {
  const positions = geometryPositions(proposal, image)
  const seed: LessonSeed = {
    nodes: proposal.components.map((component) => ({
      id: component.id,
      kind: component.type,
      // Unknown switch state seeds open (never closed): the safe
      // direction, always paired with a needs-review badge.
      closed: component.type === 'switch' ? (component.closed ?? false) : undefined,
      polarity:
        component.type === 'battery' ? (component.polarity ?? undefined) : undefined,
      x: positions[component.id]?.x ?? ORIGIN_X,
      y: positions[component.id]?.y ?? ORIGIN_Y,
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

/** Place proposal parts on a grid and name its wires V1..Vn. */
export function layoutProposal(proposal: VisionProposal): ProposalLayout {
  const seed: LessonSeed = {
    nodes: proposal.components.map((component, index) => ({
      id: component.id,
      kind: component.type,
      closed: component.type === 'switch' ? (component.closed ?? false) : undefined,
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
