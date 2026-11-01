import type { ComponentCondition, Netlist, SimulateResult } from '../api/client'
import { bannerModel } from '../canvas/banner'

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
      Object.values(result.conditions ?? {}).some((condition) => condition === 'damaged')) {
    return false
  }
  const totalBatteryVolts = batteries.reduce((sum, reading) => sum + Math.abs(reading.voltage), 0)
  return totalBatteryVolts - Math.abs(measuredSourceVolts(result, netlist)) > 1e-6
}

function formatVolts(value: number): string {
  return `${Number.isInteger(value) ? value.toString() : value.toFixed(1)} V`
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
  const lit = bulbs.filter((bulb) => bulb.watts > 1e-9)
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

function bulbWords(record: RunRecord): string {
  if (record.bulbCount === 0) {
    return 'no bulbs'
  }
  if (record.bulbsLit === 0) {
    return 'bulb dark'
  }
  return record.bulbsLit === 1 ? '1 bulb lit' : `${record.bulbsLit} bulbs lit`
}

/** One line per run, e.g. `Run 3  -  Switch opened  -  0.0 A  -  bulb dark`. */
export function summarizeRun(record: RunRecord): string {
  if (!record.valid) {
    const code = record.errorCode ?? 'rejected'
    return `Run ${record.n}  -  ${record.label}  -  not testable (${code})`
  }
  const base = `Run ${record.n}  -  ${record.label}  -  ${record.sourceVolts.toFixed(1)} V net source  -  ${record.amps.toFixed(1)} A  -  ${bulbWords(record)}`
  const events = record.bulbs
    .filter((bulb) => bulb.condition === 'overloaded' || bulb.condition === 'damaged')
    .map((bulb) => `${bulb.id} ${bulb.condition}`)
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
      bulb.condition === 'overloaded' ||
      bulb.condition === 'damaged' ||
      before.condition === 'overloaded' ||
      before.condition === 'damaged'
    if (!eventful || Math.abs(bulb.watts - before.watts) < 0.05) {
      continue
    }
    const span = `${bulb.id} power ${before.watts.toFixed(1)} W → ${bulb.watts.toFixed(1)} W`
    if (before.watts > 0 && bulb.watts > 0) {
      parts.push(`${span} (${(bulb.watts / before.watts).toFixed(1)}×)`)
    } else {
      parts.push(span)
    }
  }
  return `Compared with run ${previous.n}: ${parts.join(', ')}.`
}
