import type { Netlist, SimulateResult } from '../api/client'
import { LIT_POWER_W } from '../lessons/lesson'

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
  const litBulbs = bulbIds.filter(
    (id) => (result.components[id]?.power ?? 0) > LIT_POWER_W,
  )
  const amps = bulbIds.reduce(
    (peak, id) => Math.max(peak, Math.abs(result.components[id]?.current ?? 0)),
    0,
  )
  const hasOpenSwitch = netlist.components.some(
    (component) => component.type === 'switch' && component.closed === false,
  )
  return {
    state: litBulbs.length > 0 ? 'CLOSED LOOP' : hasOpenSwitch ? 'LOOP OPEN' : 'NO GLOW',
    amps,
    outcome:
      litBulbs.length === 0
        ? bulbIds.length === 0
          ? 'NO BULBS'
          : 'BULB DARK'
        : litBulbs.length === 1
          ? 'BULB LIT'
          : `${litBulbs.length} BULBS LIT`,
    lit: litBulbs.length > 0,
  }
}
