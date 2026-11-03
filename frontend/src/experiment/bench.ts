import type { ComponentCondition } from '../api/client'

/** Bench-local helpers: validated voltage edits and the explosion latch.
 * Pure and solver-free; the solver stays the only physics authority. */

export type VoltsValidation = { ok: true; value: number } | { ok: false; error: string }

export const MIN_BATTERY_VOLTS = 0.1
export const MAX_BATTERY_VOLTS = 24

/** Accept finite positive voltages only; the solver rejects the rest anyway. */
export function validateBatteryVolts(raw: string): VoltsValidation {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { ok: false, error: 'Enter a voltage.' }
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Enter a finite number of volts.' }
  }
  if (value < MIN_BATTERY_VOLTS || value > MAX_BATTERY_VOLTS) {
    return { ok: false, error: `Voltage must be between ${MIN_BATTERY_VOLTS} V and ${MAX_BATTERY_VOLTS} V.` }
  }
  return { ok: true, value }
}

/** Exploded bulbs stay exploded until the bench resets; overworked ones
 * recover as soon as the voltage drops back into range.
 * Returns only the latch entries, so the caller merges them into bench
 * state without discarding other bulbs. */
export function latchedExplosion(
  conditions: Record<string, ComponentCondition> | undefined,
): Record<string, 'exploded'> {
  const latched: Record<string, 'exploded'> = {}
  if (conditions === undefined) {
    return latched
  }
  for (const [id, condition] of Object.entries(conditions)) {
    if (condition === 'exploded') {
      latched[id] = 'exploded'
    }
  }
  return latched
}
