import type { Netlist, SimulateResult } from '../api/client'
import { bannerModel } from '../canvas/banner'

/** One session-local history entry: what ran and what it measured. */
export interface RunRecord {
  n: number
  label: string
  valid: boolean
  amps: number
  bulbsLit: number
  bulbCount: number
  errorCode: string | null
}

/** Describe a fresh solver run; invalid runs keep their rejection code. */
export function describeRun(
  n: number,
  label: string,
  result: SimulateResult,
  netlist: Netlist,
): RunRecord {
  const bulbs = netlist.components.filter((part) => part.type === 'bulb')
  if (!result.ok) {
    return {
      n,
      label,
      valid: false,
      amps: 0,
      bulbsLit: 0,
      bulbCount: bulbs.length,
      errorCode: result.error_code,
    }
  }
  const banner = bannerModel(result, netlist)
  const lit = bulbs.filter((bulb) => (result.components[bulb.id]?.power ?? 0) > 1e-9)
  return {
    n,
    label,
    valid: true,
    amps: banner?.amps ?? 0,
    bulbsLit: lit.length,
    bulbCount: bulbs.length,
    errorCode: null,
  }
}

function bulbWords(record: RunRecord): string {
  if (record.bulbCount === 0) {
    return 'no bulbs'
  }
  if (record.bulbsLit === 0) {
    return 'bulb dark'
  }
  return record.bulbsLit === 1 ? '1 bulb lit' : `${record.bulbsLit} bulbs lit`
}

/** One line per run, e.g. `Run 3 — Switch opened — 0.0 A — bulb dark`. */
export function summarizeRun(record: RunRecord): string {
  if (!record.valid) {
    const code = record.errorCode ?? 'rejected'
    return `Run ${record.n} — ${record.label} — not testable (${code})`
  }
  return `Run ${record.n} — ${record.label} — ${record.amps.toFixed(1)} A — ${bulbWords(record)}`
}

/** Current run against the previous one; null when there is no previous run. */
export function compareRuns(previous: RunRecord | null, current: RunRecord): string | null {
  if (previous === null) {
    return null
  }
  if (!previous.valid || !current.valid) {
    if (previous.valid === current.valid) {
      return 'Both runs were rejected — fix the wiring to compare measurements.'
    }
    return current.valid
      ? 'This run tested after the last rejection — compare the new readings above.'
      : 'The last run tested but this one was rejected — what changed in the wiring?'
  }
  const dAmps = current.amps - previous.amps
  const litShift = current.bulbsLit - previous.bulbsLit
  const parts: string[] = []
  if (Math.abs(dAmps) < 0.05) {
    parts.push('about the same current')
  } else {
    parts.push(`${dAmps > 0 ? 'more' : 'less'} current (${previous.amps.toFixed(1)} A → ${current.amps.toFixed(1)} A)`)
  }
  if (litShift !== 0) {
    parts.push(`${previous.bulbsLit} → ${current.bulbsLit} bulbs lit`)
  }
  return `Compared with run ${previous.n}: ${parts.join(', ')}.`
}
