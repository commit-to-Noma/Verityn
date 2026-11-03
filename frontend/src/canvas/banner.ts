import type { Netlist, SimulateResult } from '../api/client'
import { LIT_POWER_W } from '../lessons/lesson'
import { glowIntensity, isDimGlow } from './visuals'

/** Compact canvas overlay reading: net source volts, headline amps, lit word. */
export interface HudReading {
  sourceVolts: number
  amps: number
  lit: boolean
  strain: boolean
  /** Every lit bulb glows below half nominal brightness. */
  dim: boolean
  /** Opposing batteries cancel with the loop closed and dark. */
  standoff: boolean
}

export interface BannerModel {
  /** Loop topology read from the netlist: closed, open switch, standoff, or no glow. */
  state: string
  /** Headline bulb current in amps (largest magnitude across bulbs). */
  amps: number
  /** Bulb outcome phrase. */
  outcome: string
  lit: boolean
  /** Any lit bulb is straining past its rating; the outcome names it. */
  strain: boolean
  /** Every lit bulb is dim; the outcome says DIM instead of LIT. */
  dim: boolean
  /** Opposing batteries cancel with the loop closed and dark. */
  standoff: boolean
}

/**
 * Pure hero line for a solved circuit; null when the run did not solve.
 * `opposed` comes from the caller (batteriesOppose) so this module stays
 * free of the history import cycle.
 */
export function bannerModel(result: SimulateResult, netlist: Netlist, opposed = false): BannerModel | null {
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
  const strained = litBulbs.filter((id) => conditions[id] === 'overworked')
  const allDim = litBulbs.length > 0 && litBulbs.every((id) => isDimGlow(glowIntensity(result.components[id]?.power ?? 0)))
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
  const standoff =
    opposed && litBulbs.length === 0 && exploded.length === 0 && bulbIds.length > 0 && !hasOpenSwitch
  return {
    state:
      litBulbs.length > 0 ? 'CLOSED LOOP' : standoff ? 'STANDOFF' : hasOpenSwitch ? 'LOOP OPEN' : 'NO GLOW',
    amps,
    outcome:
      strained.length > 0
        ? strained.length === 1
          ? 'BULB OVERWORKED'
          : `${strained.length} BULBS OVERWORKED`
        : litBulbs.length > 0
          ? litBulbs.length === 1
            ? allDim
              ? 'BULB DIM'
              : 'BULB LIT'
            : allDim
              ? `${litBulbs.length} BULBS DIM`
              : `${litBulbs.length} BULBS LIT`
          : exploded.length > 0
            ? exploded.length === 1
              ? 'BULB EXPLODED'
              : `${exploded.length} BULBS EXPLODED`
            : bulbIds.length === 0
              ? 'NO BULBS'
              : 'BULB DARK',
    lit: litBulbs.length > 0,
    strain: strained.length > 0,
    dim: allDim,
    standoff,
  }
}
