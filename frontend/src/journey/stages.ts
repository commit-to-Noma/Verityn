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
  | 'twist-predict'
  | 'twist-build'
  | 'transfer-predict'
  | 'transfer-build'
  | 'finale'

export interface JourneyState {
  entered: boolean
  l1Prediction: boolean
  twistStarted: boolean
  twistPrediction: boolean
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
  if (!state.twistStarted) {
    return 'l1-build'
  }
  if (!state.twistPrediction) {
    return 'twist-predict'
  }
  if (!state.transferStarted) {
    return 'twist-build'
  }
  if (!state.transferPrediction) {
    return 'transfer-predict'
  }
  if (!state.transferDone) {
    return 'transfer-build'
  }
  return 'finale'
}

/** Header progress: one step per chapter of the guided journey. */
export const PROGRESS_STEPS = ['Predict', 'Build', 'Twist', 'Solo'] as const

/** Index into PROGRESS_STEPS, or -1 before entering / length when complete. */
export function progressIndex(stage: Stage): number {
  switch (stage) {
    case 'intro':
      return -1
    case 'l1-predict':
      return 0
    case 'l1-build':
      return 1
    case 'twist-predict':
    case 'twist-build':
      return 2
    case 'transfer-predict':
    case 'transfer-build':
      return 3
    case 'finale':
      return PROGRESS_STEPS.length
  }
}
