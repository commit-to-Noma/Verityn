import { LABORATORY_STATIONS, type LaboratoryStationId } from '../content/homepage'

/** Pure turntable mechanics: index rotation and selection.
 * The component owns rendering; this module owns the rules, so the
 * wraparound, ordering, and route mapping are unit-tested without a
 * DOM harness. The carousel never auto-rotates: there is no timer
 * anywhere in this module or its component. */

export function stationCount(): number {
  return LABORATORY_STATIONS.length
}

export function stationIndex(id: LaboratoryStationId): number {
  return LABORATORY_STATIONS.findIndex((station) => station.id === id)
}

function wrap(index: number): number {
  const count = stationCount()
  return ((index % count) + count) % count
}

/** Next/previous station with wraparound. */
export function neighborIndex(current: number, direction: 1 | -1): number {
  return wrap(current + direction)
}

/** Clamp an arbitrary selection into range; out-of-range selects nothing new. */
export function selectIndex(current: number, requested: number): number {
  if (!Number.isInteger(requested) || requested < 0 || requested >= stationCount()) {
    return current
  }
  return requested
}

/** Screen-reader announcement for a newly selected station. */
export function stationAnnouncement(index: number): string {
  const station = LABORATORY_STATIONS[wrap(index)]
  return `${station.title} selected. ${station.description}`
}
