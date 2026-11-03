import { MAX_BATTERY_VOLTS, MIN_BATTERY_VOLTS } from './bench'
import type { RunRecord } from './history'

/** Stress-rig sweep planning and summaries. Pure and solver-free: every
 * point is a real bench run through the normal path; this module only
 * plans the voltage ladder and reads the recorded outcomes. */

export const MAX_SWEEP_POINTS = 25

export interface SweepPlan {
  batteryId: string
  points: number[]
}

export type SweepPlanValidation = { ok: true; plan: SweepPlan } | { ok: false; error: string }

function parseVolts(raw: string): number | null {
  if (raw.trim() === '') {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Validate a sweep ladder; the end point is always included even when
 * the step does not land on it. */
export function buildSweepPlan(
  batteryId: string,
  startRaw: string,
  endRaw: string,
  stepRaw: string,
): SweepPlanValidation {
  const start = parseVolts(startRaw)
  const end = parseVolts(endRaw)
  const step = parseVolts(stepRaw)
  if (start === null || end === null || step === null) {
    return { ok: false, error: 'Enter a start, end, and step voltage.' }
  }
  if (
    start < MIN_BATTERY_VOLTS ||
    start > MAX_BATTERY_VOLTS ||
    end < MIN_BATTERY_VOLTS ||
    end > MAX_BATTERY_VOLTS
  ) {
    return {
      ok: false,
      error: `Sweep voltages must stay between ${MIN_BATTERY_VOLTS} V and ${MAX_BATTERY_VOLTS} V.`,
    }
  }
  if (start > end) {
    return { ok: false, error: 'Start voltage must be at or below the end voltage.' }
  }
  if (step <= 0) {
    return { ok: false, error: 'Step must be a positive number of volts.' }
  }
  const count = Math.floor((end - start) / step + 1e-9) + 1
  const landsOnEnd = Math.abs(start + (count - 1) * step - end) < 1e-9
  const total = landsOnEnd ? count : count + 1
  if (total > MAX_SWEEP_POINTS) {
    return {
      ok: false,
      error: `That sweep runs ${total} points; use a bigger step (at most ${MAX_SWEEP_POINTS}).`,
    }
  }
  const points: number[] = []
  for (let index = 0; index < count; index += 1) {
    points.push(round2(start + index * step))
  }
  if (!landsOnEnd) {
    points.push(round2(end))
  }
  return { ok: true, plan: { batteryId, points } }
}

/** One recorded sweep point: the voltage the rig set and the run it got. */
export interface SweepPoint {
  setVolts: number
  run: RunRecord
}

export type PointState = 'rejected' | 'dark' | 'lit' | 'overworked' | 'exploded'

/** Worst-first outcome across the bench bulbs for one sweep point. */
export function pointState(point: SweepPoint): PointState {
  if (!point.run.valid) {
    return 'rejected'
  }
  const conditions = point.run.bulbs.map((bulb) => bulb.condition)
  if (conditions.includes('exploded')) {
    return 'exploded'
  }
  if (conditions.includes('overworked')) {
    return 'overworked'
  }
  return point.run.bulbsLit > 0 ? 'lit' : 'dark'
}

export const POINT_STATE_LABEL: Record<PointState, string> = {
  rejected: 'Rejected',
  dark: 'Dark',
  lit: 'Lit',
  overworked: 'Overworked',
  exploded: 'Exploded',
}

function formatSetVolts(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0$/, '')
}

/** Threshold lines from recorded points: first glow, first overwork,
 * and the blow point (later points stay latched until a reset). */
export function summarizeSweep(points: SweepPoint[]): string[] {
  if (points.length === 0) {
    return []
  }
  if (points[0].run.bulbCount === 0) {
    return ['No bulbs on the bench — the sweep measured current only.']
  }
  const lines: string[] = []
  const firstGlow = points.find((point) => point.run.valid && point.run.bulbsLit > 0)
  if (firstGlow === undefined) {
    lines.push('No glow across this sweep — every point stayed dark.')
  } else {
    lines.push(`First glow at ${formatSetVolts(firstGlow.setVolts)} V (run ${firstGlow.run.n}).`)
  }
  const firstStress = points.find((point) => pointState(point) === 'overworked')
  if (firstStress !== undefined) {
    lines.push(
      `Overworked from ${formatSetVolts(firstStress.setVolts)} V (run ${firstStress.run.n}).`,
    )
  }
  const firstBlow = points.find((point) => pointState(point) === 'exploded')
  if (firstBlow !== undefined) {
    lines.push(
      `Blew at ${formatSetVolts(firstBlow.setVolts)} V (run ${firstBlow.run.n}) — later points stay dark until the bench resets.`,
    )
  }
  return lines
}
