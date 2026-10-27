/** Presentation mapping of solver facts to canvas visuals.
 *
 * These helpers translate validated solver numbers into glow and flow
 * states. They never compute physics: power and current come only
 * from a completed `/api/simulate` response. Pure and fully tested.
 */

import { LIT_POWER_W } from '../lessons/lesson'

/** Reference bulb power: the L1 pack nominal (6 V across 10 Ω). */
export const NOMINAL_BULB_W = 3.6

/** Branch currents at or below this read as still (noise floor). */
export const CURRENT_FLOOR_A = 1e-9

/** Continuous glow 0..1 from solver power; dark at or below the floor. */
export function glowIntensity(powerW: number): number {
  if (!Number.isFinite(powerW) || powerW <= LIT_POWER_W) {
    return 0
  }
  return Math.min(1, powerW / NOMINAL_BULB_W)
}

export type CurrentFlow = 'forward' | 'reverse' | 'still'

/** Flow direction along the drawn edge from solver branch current. */
export function flowForCurrent(currentA: number): CurrentFlow {
  if (!Number.isFinite(currentA)) {
    return 'still'
  }
  if (currentA > CURRENT_FLOOR_A) {
    return 'forward'
  }
  if (currentA < -CURRENT_FLOOR_A) {
    return 'reverse'
  }
  return 'still'
}
