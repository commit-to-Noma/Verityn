import type { Netlist, SimulateResult } from '../api/client'
import { batteriesOppose, type RunRecord } from './history'

/** Session missions: checkable bench challenges. Pure and solver-free:
 * every predicate reads recorded runs and the netlists that produced
 * them; nothing here measures anything itself. */

export interface Mission {
  id: string
  title: string
  goal: string
  hint: (progress: MissionProgress) => string
}

export interface MissionProgress {
  litSeen: boolean
  darkSeen: boolean
  gapSeen: boolean
  loopClosedSeen: boolean
  tugSeen: boolean
  redlineSeen: boolean
  recoveredSeen: boolean
  blownSeen: boolean
  sweepSeen: boolean
  done: string[]
}

export function initialMissionProgress(): MissionProgress {
  return {
    litSeen: false,
    darkSeen: false,
    gapSeen: false,
    loopClosedSeen: false,
    tugSeen: false,
    redlineSeen: false,
    recoveredSeen: false,
    blownSeen: false,
    sweepSeen: false,
    done: [],
  }
}

function thresholdHint(progress: MissionProgress): string {
  if (progress.darkSeen && !progress.litSeen) {
    return 'Dark run logged — now log a lit one.'
  }
  if (progress.litSeen && !progress.darkSeen) {
    return 'Lit run logged — now log a dark one.'
  }
  return 'Log one dark run and one lit run; find where glow begins.'
}

function redlineHint(progress: MissionProgress): string {
  if (!progress.redlineSeen) {
    return 'Push a bulb past its safe limit (Overworked).'
  }
  return 'Overworked logged — bring a bulb back to Intact.'
}

export const MISSIONS: Mission[] = [
  {
    id: 'first-light',
    title: 'First Light',
    goal: 'Log a run with a glowing bulb.',
    hint: () => 'Run a circuit with a glowing bulb.',
  },
  {
    id: 'threshold',
    title: 'Threshold Finder',
    goal: 'Log a dark run and a lit run.',
    hint: thresholdHint,
  },
  {
    id: 'gap-finder',
    title: 'Gap Finder',
    goal: 'Catch an open switch keeping a bulb dark.',
    hint: () => 'Open a switch, run, and catch the gap keeping the bulb dark.',
  },
  {
    id: 'loop-closer',
    title: 'Loop Closer',
    goal: 'Light a bulb with every switch closed.',
    hint: () => 'Close every switch and light the bulb.',
  },
  {
    id: 'tug-of-war',
    title: 'Tug of War',
    goal: 'Face two batteries against each other so the net source reads about 0 V.',
    hint: () => 'Face two batteries against each other so the net source reads about 0 V.',
  },
  {
    id: 'redline',
    title: 'Redline and Recover',
    goal: 'Push a bulb to Overworked, then bring a bulb back to Intact.',
    hint: redlineHint,
  },
  {
    id: 'demolition',
    title: 'Demolition',
    goal: 'Blow a bulb past 18 V (reset restores it).',
    hint: () => 'Push past 18 V and blow a bulb (reset restores it).',
  },
  {
    id: 'full-spectrum',
    title: 'Full Spectrum',
    goal: 'Finish a Stress Rig sweep of 2 or more points.',
    hint: () => 'Run the Stress Test Rig through 2 or more points.',
  },
]

function doneIds(progress: MissionProgress): string[] {
  const done: string[] = []
  if (progress.litSeen) {
    done.push('first-light')
  }
  if (progress.litSeen && progress.darkSeen) {
    done.push('threshold')
  }
  if (progress.gapSeen) {
    done.push('gap-finder')
  }
  if (progress.loopClosedSeen) {
    done.push('loop-closer')
  }
  if (progress.tugSeen) {
    done.push('tug-of-war')
  }
  if (progress.redlineSeen && progress.recoveredSeen) {
    done.push('redline')
  }
  if (progress.blownSeen) {
    done.push('demolition')
  }
  if (progress.sweepSeen) {
    done.push('full-spectrum')
  }
  return done
}

/** Fold one solved run into mission progress. Rejected runs and
 * bulb-less benches move nothing except where noted. */
export function updateMissionProgress(
  previous: MissionProgress,
  record: RunRecord,
  result: SimulateResult,
  netlist: Netlist,
): MissionProgress {
  if (!record.valid) {
    return previous
  }
  const lit = record.bulbsLit > 0
  const dark = record.bulbCount > 0 && record.bulbsLit === 0
  const switches = netlist.components.filter((part) => part.type === 'switch')
  const conditions = record.bulbs.map((bulb) => bulb.condition)
  const next: MissionProgress = {
    litSeen: previous.litSeen || lit,
    darkSeen: previous.darkSeen || dark,
    gapSeen: previous.gapSeen || (dark && switches.some((part) => part.closed === false)),
    loopClosedSeen:
      previous.loopClosedSeen ||
      (lit && switches.length > 0 && switches.every((part) => part.closed === true)),
    tugSeen:
      previous.tugSeen ||
      (batteriesOppose(result, netlist) && Math.abs(record.sourceVolts) < 0.5),
    redlineSeen: previous.redlineSeen || conditions.includes('overworked'),
    recoveredSeen:
      previous.recoveredSeen ||
      (previous.redlineSeen &&
        lit &&
        record.bulbs.length > 0 &&
        record.bulbs.every((bulb) => bulb.condition === 'intact')),
    blownSeen: previous.blownSeen || conditions.includes('exploded'),
    sweepSeen: previous.sweepSeen,
    done: [],
  }
  next.done = doneIds(next)
  return next
}

/** A finished sweep of at least 2 points completes Full Spectrum. */
export function markSweepComplete(
  previous: MissionProgress,
  pointCount: number,
): MissionProgress {
  if (pointCount < 2) {
    return previous
  }
  const next: MissionProgress = { ...previous, sweepSeen: true, done: [] }
  next.done = doneIds(next)
  return next
}
