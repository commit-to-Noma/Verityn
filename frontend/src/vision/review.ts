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
}

/** Status banner for the review panel. Counts come from the proposal. */
export function reviewBanner(
  status: VisionProposal['status'],
  uncertainCount: number,
  connectionCount: number,
): ReviewBanner {
  if (status === 'unsupported') {
    return {
      tone: 'blocked',
      text: "Couldn't read this diagram as a circuit. Try another image — nothing was guessed.",
    }
  }
  if (status === 'needs_review') {
    return {
      tone: 'warn',
      text:
        `${uncertainCount} of ${connectionCount} ` +
        `connection${connectionCount === 1 ? '' : 's'} needs your review — ` +
        'uncertain wires load dashed grey. Verify them before testing.',
    }
  }
  return { tone: 'ok', text: 'All connections read clearly. Review, then load to the canvas.' }
}

/** Only load proposals that name at least one reviewed component. */
export function canLoadProposal(proposal: VisionProposal): boolean {
  return proposal.status !== 'unsupported' && proposal.components.length > 0
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
