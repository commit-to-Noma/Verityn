/** Presentation mapping of solver facts to canvas visuals.
 *
 * These helpers translate validated solver numbers into glow and flow
 * states. They never compute physics: power and current come only
 * from a completed `/api/simulate` response. Pure and fully tested.
 */

import type { ComponentCondition } from '../api/client'
import { LIT_POWER_W } from '../lessons/lesson'

/** Reference bulb power: the L1 pack nominal (6 V across 10 Ω). */
export const NOMINAL_BULB_W = 3.6

export type BulbVisualState = 'dark' | 'intact' | 'overworked' | 'exploded'

/**
 * Bulb stage visual from the solver's own verdict: exploded reads
 * exploded, overworked reads overworked, anything lit reads intact.
 * No physics here  -  condition and power both come from the result.
 */
export function bulbVisualState(
  condition: ComponentCondition | undefined,
  powerW: number,
): BulbVisualState {
  if (condition === 'exploded') {
    return 'exploded'
  }
  if (condition === 'overworked') {
    return 'overworked'
  }
  return glowIntensity(powerW) > 0 ? 'intact' : 'dark'
}

export type BatteryChargeBand = 'low' | 'normal' | 'high'

/** Charge-bar band from the voltage SETTING (6 V nominal); display only. */
export function batteryChargeBand(volts: number): BatteryChargeBand {
  if (!Number.isFinite(volts) || volts < 6) {
    return 'low'
  }
  if (volts <= 12) {
    return 'normal'
  }
  return 'high'
}

/** Branch currents at or below this read as still (noise floor). */
export const CURRENT_FLOOR_A = 1e-9

/** Continuous glow 0..1 from solver power; dark at or below the floor. */
export function glowIntensity(powerW: number): number {
  if (!Number.isFinite(powerW) || powerW <= LIT_POWER_W) {
    return 0
  }
  return Math.min(1, powerW / NOMINAL_BULB_W)
}

/** Burst only on the solver transition from dark to a measured lit state. */
export function shouldBurstGlow(previousGlow: number, powerW: number): boolean {
  return previousGlow <= 0 && glowIntensity(powerW) > 0
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

/** Dash-cycle seconds at the L1 nominal branch current (0.6 A). */
export const NOMINAL_FLOW_S = 0.5

/** Fastest and slowest dash cycles; extremes clamp instead of freezing. */
export const MIN_FLOW_S = 0.15
export const MAX_FLOW_S = 2

/**
 * Dash-cycle seconds from solver branch current, or null when still.
 * Speed rises with |current| (nominal 0.6 A reads 0.5 s); the floor
 * and non-finite inputs stay still so uncertain branches never move.
 */
export function flowDurationForCurrent(currentA: number): number | null {
  if (!Number.isFinite(currentA) || Math.abs(currentA) <= CURRENT_FLOOR_A) {
    return null
  }
  const scaled = (NOMINAL_FLOW_S * 0.6) / Math.abs(currentA)
  return Math.min(MAX_FLOW_S, Math.max(MIN_FLOW_S, Math.round(scaled * 1000) / 1000))
}
