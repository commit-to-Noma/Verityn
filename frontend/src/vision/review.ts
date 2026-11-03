/** Presentation mapping for vision proposals awaiting learner review.
 *
 * These helpers translate a validated `VisionProposal` into banner copy,
 * region overlays, and load gating. They never reinterpret the model
 * output: statuses, polarity, and evidence come only from the
 * server-validated proposal. Pure and fully tested.
 */

import type { VisionProposal } from '../api/client'

export type ReviewTone = 'ok' | 'warn' | 'blocked'

export interface ReviewBanner {
  tone: ReviewTone
  text: string
  hint?: string
}

export type LensViewMode = 'compare' | 'original' | 'detected' | 'model'

export const LENS_VIEW_MODES: ReadonlyArray<{ id: LensViewMode; label: string }> = [
  { id: 'compare', label: 'Compare' },
  { id: 'original', label: 'Original' },
  { id: 'detected', label: 'Marked photo' },
  { id: 'model', label: 'Interactive model' },
]

/** Review always opens side by side; the learner can narrow to one panel. */
export const DEFAULT_LENS_VIEW: LensViewMode = 'compare'

/** Status banner for the review panel. Counts come from the proposal. */
export function reviewBanner(
  status: VisionProposal['status'],
  _uncertainCount: number,
  _connectionCount: number,
): ReviewBanner {
  if (status === 'unsupported') {
    return {
      tone: 'blocked',
      text: 'This image does not look like a supported circuit. Nothing was guessed.',
      hint: 'Try a schematic or photo containing a battery, bulb, switch, and visible wire connections.',
    }
  }
  if (status === 'needs_review') {
    return {
      tone: 'warn',
      text: 'Some connections need your review. Check the highlighted terminals before confirming.',
    }
  }
  return { tone: 'ok', text: 'Review the proposal before testing it.' }
}

/** Only load proposals that name at least one reviewed component. */
export function canLoadProposal(proposal: VisionProposal): boolean {
  return proposal.status !== 'unsupported' && proposal.components.length > 0
}

/** Solver access always requires an explicit learner confirmation. */
export function canTestProposal(proposal: VisionProposal, confirmed: boolean): boolean {
  return canLoadProposal(proposal) && confirmed
}

/**
 * Ambiguous-wire note, honest about whether the route itself was traced.
 * Traced wires still need endpoint verification; untraced ones are
 * terminal relationships only.
 */
export function ambiguousWireNote(traced: boolean): string {
  if (traced) {
    return 'Ambiguous endpoints, but the wire route is traced on your photo - verify both before confirming.'
  }
  return 'Ambiguous: verify these endpoints on the replica before confirming. Wires carry no image region - only the terminal relationship was proposed.'
}

/** Disclaimer under the evidence list, counted from the traced wires. */
export function wireTraceSummary(traced: number, total: number): string {
  if (total === 0) {
    return 'No wires proposed.'
  }
  if (traced === total) {
    return 'Wire routes are traced on your photo; the replica still reconstructs its own between terminals.'
  }
  if (traced === 0) {
    return 'Terminal relationships are model-proposed; contact geometry is not traced from the image. Verify each wire on the replica before confirming.'
  }
  return `${traced} of ${total} wires traced on your photo; the rest are terminal relationships only. The replica reconstructs all routes.`
}

/** Normalized path to SVG points; one decimal keeps assertions exact. */
export function wirePathPoints(path: [number, number][]): string {
  return path.map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(' ')
}

/** Normalized 0..1 evidence bounds as CSS percentage offsets. */
export function regionStyle(bounds: { x: number; y: number; width: number; height: number }): {
  left: string
  top: string
  width: string
  height: string
} {
  const percent = (value: number): string => `${(value * 100).toFixed(2)}%`
  return {
    left: percent(bounds.x),
    top: percent(bounds.y),
    width: percent(bounds.width),
    height: percent(bounds.height),
  }
}

/** Battery polarity as +terminal / −terminal, e.g. "+a −b". */
export function polarityText(polarity: { positive: 'a' | 'b'; negative: 'a' | 'b' }): string {
  return `+${polarity.positive} −${polarity.negative}`
}

/** Canonical review statuses for extraction provenance. */
export type ReviewStatus =
  | 'verified'
  | 'needs-review'
  | 'connection-ambiguous'
  | 'unsupported-diagram'
  | 'learner-corrected'

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  verified: 'Verified',
  'needs-review': 'Needs review',
  'connection-ambiguous': 'Connection ambiguous',
  'unsupported-diagram': 'Unsupported diagram',
  'learner-corrected': 'Learner corrected',
}

/** Per-component status: corrected wins, then unknowns and uncertain wires. */
export function componentReviewStatus(
  componentId: string,
  proposal: VisionProposal,
  learnerCorrected: boolean,
): ReviewStatus {
  if (proposal.status === 'unsupported') {
    return 'unsupported-diagram'
  }
  if (learnerCorrected) {
    return 'learner-corrected'
  }
  const part = proposal.components.find((component) => component.id === componentId)
  const unknown =
    part !== undefined &&
    ((part.type === 'switch' && part.closed === null) ||
      (part.type === 'battery' && part.polarity === null))
  const touched = proposal.connections.some(
    (connection) =>
      connection.uncertain &&
      (connection.from.node === componentId || connection.to.node === componentId),
  )
  return touched || unknown || proposal.status === 'needs_review' ? 'needs-review' : 'verified'
}

/** Per-connection status straight from the validated uncertain flag. */
export function connectionReviewStatus(connection: {
  uncertain: boolean
}): 'verified' | 'connection-ambiguous' {
  return connection.uncertain ? 'connection-ambiguous' : 'verified'
}

/** Proposal summary with live counts, e.g. "We found 1 battery, …". */
export function reviewSummary(proposal: VisionProposal): string {
  const count = (type: string): number =>
    proposal.components.filter((component) => component.type === type).length
  const parts: string[] = []
  const batteries = count('battery')
  const switches = count('switch')
  const bulbs = count('bulb')
  if (batteries > 0) {
    parts.push(`${batteries} ${batteries === 1 ? 'battery' : 'batteries'}`)
  }
  if (switches > 0) {
    parts.push(`${switches} ${switches === 1 ? 'switch' : 'switches'}`)
  }
  if (bulbs > 0) {
    parts.push(`${bulbs} ${bulbs === 1 ? 'bulb' : 'bulbs'}`)
  }
  const wires = proposal.connections.length
  parts.push(`${wires} proposed ${wires === 1 ? 'connection' : 'connections'}`)
  return `We found ${parts.join(', ')}.`
}

/** Circuit health for the idle inspector: part counts, open switches,
 * and how many parts still need review. Pure proposal read. */
export function proposalHealth(proposal: VisionProposal): {
  partsLine: string
  openSwitches: string[]
  reviewCount: number
} {
  const count = (type: string): number =>
    proposal.components.filter((component) => component.type === type).length
  const batteries = count('battery')
  const switches = count('switch')
  const bulbs = count('bulb')
  const total = proposal.components.length
  const parts: string[] = []
  if (batteries > 0) {
    parts.push(`${batteries} ${batteries === 1 ? 'battery' : 'batteries'}`)
  }
  if (switches > 0) {
    parts.push(`${switches} ${switches === 1 ? 'switch' : 'switches'}`)
  }
  if (bulbs > 0) {
    parts.push(`${bulbs} ${bulbs === 1 ? 'bulb' : 'bulbs'}`)
  }
  const openSwitches = proposal.components
    .filter((component) => component.type === 'switch' && component.closed === false)
    .map((component) => component.id)
  let reviewCount = 0
  for (const component of proposal.components) {
    if (componentReviewStatus(component.id, proposal, false) === 'needs-review') {
      reviewCount += 1
    }
  }
  return {
    partsLine: `${total} ${total === 1 ? 'part' : 'parts'}${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`,
    openSwitches,
    reviewCount,
  }
}

/** Extraction reveal steps: image → regions → replica → review. */
export const REVEAL_STEPS = ['image', 'regions', 'replica', 'review'] as const

export type RevealStep = (typeof REVEAL_STEPS)[number]

/** Advance the reveal; interruptions jump straight to review. */
export function nextRevealStep(step: RevealStep, interrupt: boolean): RevealStep {
  if (interrupt || step === 'review') {
    return 'review'
  }
  return REVEAL_STEPS[REVEAL_STEPS.indexOf(step) + 1] ?? 'review'
}
