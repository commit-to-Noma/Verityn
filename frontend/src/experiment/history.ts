import type { ComponentCondition, Netlist, SimulateResult } from '../api/client'
import { bannerModel, type HudReading } from '../canvas/banner'
import { friendlyComponentName } from '../components/componentNames'
import { LIT_POWER_W } from '../lessons/lesson'

/** One bulb's measured outcome in a run; condition is null when the
 * solver reported none (old-shape results and rejected runs). */
export interface RunBulb {
  id: string
  volts: number
  amps: number
  watts: number
  condition: ComponentCondition | null
}

/** One session-local history entry: what ran and what it measured. */
export interface RunRecord {
  n: number
  label: string
  valid: boolean
  amps: number
  bulbsLit: number
  bulbCount: number
  errorCode: string | null
  bulbs: RunBulb[]
  /** Signed source voltage from solver battery measurements. */
  sourceVolts: number
}

function bulbMeasurements(result: SimulateResult, netlist: Netlist): RunBulb[] {
  const conditions = result.conditions ?? {}
  return netlist.components
    .filter((part) => part.type === 'bulb')
    .map((bulb) => {
      const measured = result.components[bulb.id]
      return {
        id: bulb.id,
        volts: measured?.voltage ?? 0,
        amps: measured?.current ?? 0,
        watts: measured?.power ?? 0,
        condition: conditions[bulb.id] ?? null,
      }
    })
}

export function measuredSourceVolts(result: SimulateResult, netlist: Netlist): number {
  const batteries = netlist.components.filter((part) => part.type === 'battery')
  const batteryReadings = batteries.map((part) => result.components[part.id]).filter(Boolean)
  if (batteryReadings.some((reading) => Math.abs(reading.current) > 1e-9)) {
    return batteryReadings.reduce(
      (total, reading) => Math.abs(reading.current) <= 1e-9
        ? total
        : total + reading.voltage * (reading.current < 0 ? 1 : -1),
      0,
    )
  }
  const bulbReadings = netlist.components
    .filter((part) => part.type === 'bulb')
    .map((part) => result.components[part.id]?.voltage ?? 0)
  return bulbReadings.length === 0 ? 0 : Math.max(...bulbReadings.map(Math.abs))
}

export function batteriesOppose(result: SimulateResult, netlist: Netlist): boolean {
  const batteries = netlist.components
    .filter((part) => part.type === 'battery')
    .map((part) => result.components[part.id])
    .filter(Boolean)
  const currents = batteries.map((reading) => reading.current)
  if (currents.some((current) => current < -1e-9) && currents.some((current) => current > 1e-9)) {
    return true
  }
  if (batteries.length < 2 || currents.some((current) => Math.abs(current) > 1e-9)) {
    return false
  }
  if (netlist.components.some((part) => part.type === 'switch' && !part.closed) ||
      Object.values(result.conditions ?? {}).some((condition) => condition === 'exploded')) {
    return false
  }
  const totalBatteryVolts = batteries.reduce((sum, reading) => sum + Math.abs(reading.voltage), 0)
  return totalBatteryVolts - Math.abs(measuredSourceVolts(result, netlist)) > 1e-6
}

function formatVolts(value: number): string {
  return `${Number.isInteger(value) ? value.toString() : value.toFixed(1)} V`
}

/** Heads-up reading for the canvas overlay; null unless the run solved. */
export function hudReading(result: SimulateResult, netlist: Netlist): HudReading | null {
  const banner = bannerModel(result, netlist, batteriesOppose(result, netlist))
  if (banner === null) {
    return null
  }
  return {
    sourceVolts: measuredSourceVolts(result, netlist),
    amps: banner.amps,
    lit: banner.lit,
    strain: banner.strain,
    dim: banner.dim,
    standoff: banner.standoff,
  }
}

/** Describe a fresh solver run; invalid runs keep their rejection code. */
export function describeRun(
  n: number,
  label: string,
  result: SimulateResult,
  netlist: Netlist,
): RunRecord {
  const bulbs = bulbMeasurements(result, netlist)
  if (!result.ok) {
    return {
      n,
      label,
      valid: false,
      amps: 0,
      bulbsLit: 0,
      bulbCount: bulbs.length,
      errorCode: result.error_code,
      bulbs,
      sourceVolts: 0,
    }
  }
  const banner = bannerModel(result, netlist)
  const lit = bulbs.filter((bulb) => bulb.condition !== 'exploded' && bulb.watts > LIT_POWER_W)
  return {
    n,
    label,
    valid: true,
    amps: banner?.amps ?? 0,
    bulbsLit: lit.length,
    bulbCount: bulbs.length,
    errorCode: null,
    bulbs,
    sourceVolts: measuredSourceVolts(result, netlist),
  }
}

const ERROR_WORDS: Record<string, string> = {
  DANGLING_TERMINAL: 'Loose wire',
  FLOATING_COMPONENT: 'Unwired part',
  SHORTED_BATTERY: 'Short circuit',
  CONFLICTING_SOURCES: 'Conflicting batteries',
  EMPTY_CIRCUIT: 'Empty bench',
  NO_BATTERY: 'No battery',
  MALFORMED_NETLIST: 'Unreadable circuit',
  INVALID_VALUE: 'Bad value',
  UNSOLVABLE: 'Unsolvable',
  NO_PATH: 'Incomplete loop',
  SHORT_CIRCUIT: 'Short circuit',
}

/** Solver rejection codes in plain words; unknown codes are humanized,
 * never shown raw outside Trace. */
export function friendlyErrorCode(code: string | null | undefined): string {
  if (code === null || code === undefined || code === '') {
    return 'Rejected'
  }
  const known = ERROR_WORDS[code]
  if (known !== undefined) {
    return known
  }
  return code
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

/** One line per run, e.g. `Run 3  -  Switch opened  -  0.0 A`; the
 * outcome pill beside it carries lit/dark/rejected. */
export function summarizeRun(record: RunRecord): string {
  if (!record.valid) {
    return `Run ${record.n}  -  ${record.label}  -  not testable (${friendlyErrorCode(record.errorCode)})`
  }
  const base = `Run ${record.n}  -  ${record.label}  -  ${record.sourceVolts.toFixed(1)} V net source  -  ${record.amps.toFixed(1)} A`
  const events = record.bulbs
    .filter((bulb) => bulb.condition === 'overworked' || bulb.condition === 'exploded')
    .map((bulb) => `${friendlyComponentName(bulb.id)} ${bulb.condition}`)
  return events.length === 0 ? base : `${base}  -  ${events.join(', ')}`
}

/** Current run against the previous one; null when there is no previous run. */
export function compareRuns(previous: RunRecord | null, current: RunRecord): string | null {
  if (previous === null) {
    return null
  }
  if (!previous.valid || !current.valid) {
    if (previous.valid === current.valid) {
      return 'Both runs were rejected  -  fix the wiring to compare measurements.'
    }
    return current.valid
      ? 'This run tested after the last rejection  -  compare the new readings above.'
      : 'The last run tested but this one was rejected  -  what changed in the wiring?'
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
  if (previous.sourceVolts !== current.sourceVolts) {
    parts.push(
      `net source ${formatVolts(previous.sourceVolts)} → ${formatVolts(current.sourceVolts)}`,
    )
  }
  for (const bulb of current.bulbs) {
    const before = previous.bulbs.find((entry) => entry.id === bulb.id)
    if (before === undefined) {
      continue
    }
    const eventful =
      bulb.condition === 'overworked' ||
      bulb.condition === 'exploded' ||
      before.condition === 'overworked' ||
      before.condition === 'exploded'
    if (!eventful || Math.abs(bulb.watts - before.watts) < 0.05) {
      continue
    }
    const span = `${friendlyComponentName(bulb.id)} power ${before.watts.toFixed(1)} W → ${bulb.watts.toFixed(1)} W`
    if (before.watts > 0 && bulb.watts > 0) {
      parts.push(`${span} (${(bulb.watts / before.watts).toFixed(1)}×)`)
    } else {
      parts.push(span)
    }
  }
  return `Compared with run ${previous.n}: ${parts.join(', ')}.`
}

/** Fixed bulb resistance, mirrored from the solver (BULB_OHMS). Display math only. */
export const BULB_OHMS = 10

/**
 * Bench diagnostics: code-written failure lines from the solver's own
 * numbers (no model call). One line per overworked or exploded bulb.
 */
export function diagnoseRun(
  result: SimulateResult,
  netlist: Netlist,
  previous: RunRecord | null,
): string[] {
  if (!result.ok) {
    const code = result.error_code ?? 'rejected'
    const names = (result.component_ids ?? []).map((id) => friendlyComponentName(id))
    const who = names.length === 0 ? null : names.join(', ')
    if (code === 'DANGLING_TERMINAL') {
      return [
        who === null
          ? 'Loose wire: some terminals are not connected, so the loop is incomplete. Connect every open terminal and run again.'
          : `Loose wire: ${who} ${names.length === 1 ? 'has' : 'have'} a loose end, so the loop is incomplete. Connect every open terminal and run again.`,
      ]
    }
    if (code === 'FLOATING_COMPONENT') {
      return [
        who === null
          ? 'Unwired part: a part is not wired into the loop. Connect every component, then run again.'
          : `Unwired part: ${who} ${names.length === 1 ? 'is' : 'are'} not wired into the loop. Connect every component, then run again.`,
      ]
    }
    if (code === 'SHORTED_BATTERY') {
      const cells = (result.component_ids ?? [])
        .filter((id) => netlist.components.some((part) => part.id === id && part.type === 'battery'))
        .map((id) => friendlyComponentName(id))
      const target = cells.length > 0 ? cells.join(', ') : who
      return [
        target === null
          ? 'Short circuit: a wire connects the battery straight back to itself. Give the current a path through a bulb instead.'
          : `Short circuit: a wire connects ${target} straight back to itself. Give the current a path through a bulb instead.`,
      ]
    }
    if (code === 'CONFLICTING_SOURCES') {
      return [
        who === null
          ? 'Conflicting batteries: two batteries fight each other, so the circuit cannot settle. Use one battery at a time.'
          : `Conflicting batteries: ${who} fight each other, so the circuit cannot settle. Use one battery at a time.`,
      ]
    }
    return [
      `Not testable (${friendlyErrorCode(code)}). Fix the wiring and run again.`,
    ]
  }
  const lines: string[] = []
  for (const bulb of netlist.components.filter((part) => part.type === 'bulb')) {
    const condition = result.conditions?.[bulb.id]
    const measured = result.components[bulb.id]
    const limit = result.ratings?.[bulb.id]?.max_safe_watts
    if (condition === 'overworked' && measured !== undefined && limit !== undefined) {
      lines.push(
        `${friendlyComponentName(bulb.id)} took ${measured.power.toFixed(1)} W against a ${limit.toFixed(1)} W safe limit ` +
          `(${measured.voltage.toFixed(1)} V, ${measured.current.toFixed(1)} A). ` +
          'Lower a battery voltage or add another bulb to share the load.',
      )
    } else if (condition === 'exploded') {
      const before = previous?.bulbs.find((entry) => entry.id === bulb.id) ?? null
      const blew =
        before !== null && previous !== null && before.watts > 0
          ? ` Run ${previous.n} pushed it to ${before.watts.toFixed(1)} W.`
          : limit === undefined
            ? ' It blew past its safe limit.'
            : ` It blew past its ${limit.toFixed(1)} W limit.`
      lines.push(
        `${friendlyComponentName(bulb.id)} exploded and passes no current.${blew} Reset the bench to restore it.`,
      )
    }
  }
  return lines
}
