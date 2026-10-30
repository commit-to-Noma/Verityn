import type { ComponentCondition } from '../api/client'

/** Bench-local helpers: validated voltage edits and the damage latch.
 * Pure and solver-free; the solver stays the only physics authority. */

export type VoltsValidation = { ok: true; value: number } | { ok: false; error: string }

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
  if (value <= 0) {
    return { ok: false, error: 'Voltage must be above zero.' }
  }
  return { ok: true, value }
}

/** Overloaded bulbs fail before the next run; damaged ones stay damaged.
 * Returns only the latch entries, so the caller merges them into bench
 * state without discarding other bulbs. */
export function latchedDamage(
  conditions: Record<string, ComponentCondition> | undefined,
): Record<string, 'damaged'> {
  const latched: Record<string, 'damaged'> = {}
  if (conditions === undefined) {
    return latched
  }
  for (const [id, condition] of Object.entries(conditions)) {
    if (condition === 'overloaded' || condition === 'damaged') {
      latched[id] = 'damaged'
    }
  }
  return latched
}
