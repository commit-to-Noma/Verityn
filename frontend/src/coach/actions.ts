/** Closed vocabulary of coach diagram demonstrations.
 *
 * The coach may only propose actions from this list, and only with the
 * learner's explicit consent ([Show me]). Switch actions edit the canvas
 * through the same toggle path as a manual tap, so the solver re-judges
 * whatever results; highlight_path is visual only and changes nothing.
 * Unknown input never becomes an action.
 */

export const COACH_ACTIONS = ['open_switch', 'close_switch', 'highlight_path'] as const

export type CoachAction = (typeof COACH_ACTIONS)[number]

export function parseCoachAction(value: unknown): CoachAction | null {
  if (typeof value !== 'string') {
    return null
  }
  return (COACH_ACTIONS as readonly string[]).includes(value) ? (value as CoachAction) : null
}

export interface Demonstration {
  action: CoachAction
  target: string
}

/** Deterministic learner-facing offer copy. No model call. */
export function describeDemonstration(demo: Demonstration): string {
  switch (demo.action) {
    case 'open_switch':
      return `Coach wants to open ${demo.target} to demonstrate the break in the loop.`
    case 'close_switch':
      return `Coach wants to close ${demo.target} to demonstrate the completed loop.`
    case 'highlight_path':
      return `Coach wants to highlight ${demo.target} on the diagram.`
  }
}
