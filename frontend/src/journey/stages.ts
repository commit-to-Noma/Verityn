/** Pure journey stage machine: which chapter the learner sees.
 *
 * This module decides presentation only. It never judges circuits,
 * predictions, or verdicts: every advance into a new stage is driven by
 * state the caller already gated (a recorded prediction, a solver result
 * matching the pack's expected numbers). Auto-advance timers live in
 * App; the mapping below is what they advance through.
 */

export type Stage =
  | 'intro'
  | 'l1-predict'
  | 'l1-build'
  | 'reality-predict'
  | 'reality-build'
  | 'transfer-predict'
  | 'transfer-build'
  | 'finale'

export interface JourneyState {
  entered: boolean
  l1Prediction: boolean
  realityStarted: boolean
  realityPrediction: boolean
  transferStarted: boolean
  transferPrediction: boolean
  transferDone: boolean
}

export function stageFor(state: JourneyState): Stage {
  if (!state.entered) {
    return 'intro'
  }
  if (!state.l1Prediction) {
    return 'l1-predict'
  }
  if (!state.realityStarted) {
    return 'l1-build'
  }
  if (!state.realityPrediction) {
    return 'reality-predict'
  }
  if (!state.transferStarted) {
    return 'reality-build'
  }
  if (!state.transferPrediction) {
    return 'transfer-predict'
  }
  if (!state.transferDone) {
    return 'transfer-build'
  }
  return 'finale'
}

/** Persistent-shell location: hub, lab journey, experiment bench, or lens. */
export type ShellLocation = 'hub' | 'lab' | 'experiment' | 'lens'

/** Workspaces overlay wherever the learner was; otherwise entered decides. */
export function shellLocation(
  entered: boolean,
  lensPage: boolean,
  experimentPage = false,
): ShellLocation {
  if (lensPage) {
    return 'lens'
  }
  if (experimentPage) {
    return 'experiment'
  }
  return entered ? 'lab' : 'hub'
}

export interface ShellNavItem {
  id: ShellLocation
  label: string
  /** Shown beside entries that are not built yet; they stay disabled. */
  badge?: string
  disabled?: boolean
}

/** Persistent laboratory navigation. */
export const SHELL_NAV: ShellNavItem[] = [
  { id: 'hub', label: 'Hub' },
  { id: 'lab', label: 'Guided Lab' },
  { id: 'experiment', label: 'Experiment' },
  { id: 'lens', label: 'Reality Lens' },
]

/** Header progress: one step per chapter of the guided journey. */
export const PROGRESS_STEPS = ['Predict', 'Build', 'Reality Check', 'Solo'] as const

/** Index into PROGRESS_STEPS, or -1 before entering / length when complete. */
export function progressIndex(stage: Stage): number {
  switch (stage) {
    case 'intro':
      return -1
    case 'l1-predict':
      return 0
    case 'l1-build':
      return 1
    case 'reality-predict':
    case 'reality-build':
      return 2
    case 'transfer-predict':
    case 'transfer-build':
      return 3
    case 'finale':
      return PROGRESS_STEPS.length
  }
}
