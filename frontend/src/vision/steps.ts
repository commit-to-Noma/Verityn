/** Reality Lens progress: a pure derivation of step states from review progress. */

export type LensStepState = 'done' | 'current' | 'todo'

export const LENS_STEP_LABELS = ['Upload diagram', 'Review detected circuit', 'Confirm and simulate'] as const

/**
 * Upload is done once a proposal exists; review is done once the learner
 * confirms; the final step is done once the confirmed replica is tested.
 */
export function lensSteps(proposed: boolean, confirmed: boolean, tested: boolean): LensStepState[] {
  if (!proposed) {
    return ['current', 'todo', 'todo']
  }
  if (!confirmed) {
    return ['done', 'current', 'todo']
  }
  if (!tested) {
    return ['done', 'done', 'current']
  }
  return ['done', 'done', 'done']
}
