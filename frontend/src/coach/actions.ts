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

/** Live circuit part, as the canvas reports it. */
export interface CircuitPart {
  id: string
  kind: 'battery' | 'bulb' | 'switch'
  closed: boolean
}

export interface ServerAction {
  type:
    | 'highlight_component'
    | 'highlight_terminal'
    | 'set_switch_state'
    | 'pulse_current_path'
    | 'show_measurement'
  componentId: string
  terminal?: 'a' | 'b'
  closed?: boolean
}

export interface ValidatedActions {
  accepted: ServerAction[]
  rejected: number
}

/** Validate server actions against the live circuit before offering them.
 *
 * Every action must name a part on the canvas; switch flips must name a
 * switch whose state actually changes. Rejected actions never run and
 * never appear in the evidence timeline as executed.
 */
export function validateServerActions(
  actions: ServerAction[],
  parts: CircuitPart[],
): ValidatedActions {
  const byId = new Map(parts.map((part) => [part.id, part]))
  const accepted: ServerAction[] = []
  let rejected = 0
  for (const action of actions) {
    const part = byId.get(action.componentId)
    if (part === undefined) {
      rejected += 1
      continue
    }
    if (action.type === 'set_switch_state') {
      if (part.kind !== 'switch' || action.closed === undefined || action.closed === part.closed) {
        rejected += 1
        continue
      }
    }
    if (action.type === 'highlight_terminal' && action.terminal === undefined) {
      rejected += 1
      continue
    }
    accepted.push(action)
  }
  return { accepted, rejected }
}

/** Consent offer from accepted actions, or the canvas-derived fallback.
 *
 * A state-changing flip becomes the Show-me offer; highlight-only sets
 * offer a path highlight. Returns null when nothing demonstrable exists.
 */
export function offerFromActions(
  accepted: ServerAction[],
  fallback: Demonstration | null,
): Demonstration | null {
  const flip = accepted.find((action) => action.type === 'set_switch_state')
  if (flip !== undefined && flip.closed !== undefined) {
    return { action: flip.closed ? 'close_switch' : 'open_switch', target: flip.componentId }
  }
  const highlight = accepted.find(
    (action) =>
      action.type === 'highlight_component' ||
      action.type === 'highlight_terminal' ||
      action.type === 'pulse_current_path',
  )
  if (highlight !== undefined) {
    return { action: 'highlight_path', target: highlight.componentId }
  }
  return fallback
}

/** Node ids to spotlight as the demonstration preview. */
export function previewTargets(accepted: ServerAction[]): string[] {
  const targets = new Set<string>()
  for (const action of accepted) {
    if (
      action.type === 'highlight_component' ||
      action.type === 'highlight_terminal' ||
      action.type === 'pulse_current_path' ||
      action.type === 'set_switch_state'
    ) {
      targets.add(action.componentId)
    }
  }
  return [...targets]
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
