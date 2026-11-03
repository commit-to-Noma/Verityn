import type { Netlist, SimulateResult } from '../api/client'
import { LIT_POWER_W } from '../lessons/lesson'

/** Compact canvas overlay reading: net source volts, headline amps, lit word. */
export interface HudReading {
  sourceVolts: number
  amps: number
  lit: boolean
}

export interface BannerModel {
  /** Loop topology read from the netlist: closed, open switch, or no glow. */
  state: string
  /** Headline bulb current in amps (largest magnitude across bulbs). */
  amps: number
  /** Bulb outcome phrase. */
  outcome: string
  lit: boolean
}

/** Pure hero line for a solved circuit; null when the run did not solve. */
export function bannerModel(result: SimulateResult, netlist: Netlist): BannerModel | null {
  if (!result.ok) {
    return null
  }
  const bulbIds = netlist.components
    .filter((component) => component.type === 'bulb')
    .map((component) => component.id)
  const conditions = result.conditions ?? {}
  // Exploded bulbs report the surge that destroyed them, not flowing current:
  // they never count as lit and contribute no headline amps.
  const exploded = bulbIds.filter((id) => conditions[id] === 'exploded')
  const litBulbs = bulbIds.filter(
    (id) => conditions[id] !== 'exploded' && (result.components[id]?.power ?? 0) > LIT_POWER_W,
  )
  const amps = bulbIds.reduce(
    (peak, id) =>
      conditions[id] === 'exploded'
        ? peak
        : Math.max(peak, Math.abs(result.components[id]?.current ?? 0)),
    0,
  )
  const hasOpenSwitch = netlist.components.some(
    (component) => component.type === 'switch' && component.closed === false,
  )
  return {
    state: litBulbs.length > 0 ? 'CLOSED LOOP' : hasOpenSwitch ? 'LOOP OPEN' : 'NO GLOW',
    amps,
    outcome:
      litBulbs.length > 0
        ? litBulbs.length === 1
          ? 'BULB LIT'
          : `${litBulbs.length} BULBS LIT`
        : exploded.length > 0
          ? exploded.length === 1
            ? 'BULB EXPLODED'
            : `${exploded.length} BULBS EXPLODED`
          : bulbIds.length === 0
            ? 'NO BULBS'
            : 'BULB DARK',
    lit: litBulbs.length > 0,
  }
}
