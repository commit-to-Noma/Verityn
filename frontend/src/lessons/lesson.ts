/** Generic lesson engine: prediction records and lesson-pack shapes.
 *
 * This module knows nothing about circuits. All circuit-specific content
 * (netlists, wires, expected outcomes) lives in the lesson packs. */

import type { Claim, Netlist, SimulateResult, VerdictStatus } from '../api/client'

/** Bulb lit threshold, shared with the evaluator's noise floor (watts). */
export const LIT_POWER_W = 1e-9

export type Choice = 'yes' | 'no' | 'not_sure'

export const CHOICE_LABELS: Record<Choice, string> = {
  yes: 'Yes',
  no: 'No',
  not_sure: 'Not sure',
}

export interface Prediction {
  lessonId: string
  choice: Choice
  why: string
}

export function createPrediction(lessonId: string, choice: Choice, why: string): Prediction {
  return { lessonId, choice, why }
}

/** The think-first gate: a prediction counts once a choice is recorded. */
export function canProceed(choice: Choice | null): boolean {
  return choice !== null
}

export interface ExpectedFixed {
  ok: true
  lit: boolean
  component: string
  current: number
  power: number
}

/** Tolerances mirror the evaluator's conventions: 1% relative, 1e-9 W floor. */
const REL_TOLERANCE = 0.01
const ABS_TOLERANCE = 1e-9

function closeEnough(actual: number, expected: number): boolean {
  const scale = Math.max(Math.abs(actual), Math.abs(expected))
  return Math.abs(actual - expected) <= Math.max(REL_TOLERANCE * scale, ABS_TOLERANCE)
}

/** Completion check: a valid simulation matching the pack's fixed-circuit numbers. */
export function matchesExpected(result: SimulateResult, expected: ExpectedFixed): boolean {
  if (!result.ok) {
    return false
  }
  const measurement = result.components[expected.component]
  if (!measurement) {
    return false
  }
  return (
    closeEnough(measurement.current, expected.current) &&
    closeEnough(measurement.power, expected.power)
  )
}

/** Compares a recorded choice with a lesson-pack expected outcome.
 *
 * Used only where the pack stores a solver-verified expectation (the
 * broken starting circuit, which the evaluator correctly refuses to
 * judge). Not sure is unassessable: no definite prediction was made. */
export function compareWithExpected(choice: Choice, expectedLit: boolean): VerdictStatus {
  if (choice === 'not_sure') {
    return 'UNASSESSABLE'
  }
  return (choice === 'yes') === expectedLit ? 'CONSISTENT' : 'CONTRADICTED'
}

/** Maps a recorded choice to a lit claim, or null when there is nothing to judge. */
export function choiceToClaim(
  choice: Choice,
  claim: { type: string; component: string },
): Claim | null {
  if (claim.type !== 'lit' || choice === 'not_sure') {
    return null
  }
  return { type: 'lit', component: claim.component, value: choice === 'yes' }
}

export interface SeedNode {
  id: string
  kind: string
  closed?: boolean
  x: number
  y: number
}

export interface SeedEdge {
  id: string
  source: string
  sourceTerminal: string
  target: string
  targetTerminal: string
}

export interface LessonSeed {
  nodes: SeedNode[]
  edges: SeedEdge[]
}

export interface Challenge {
  id: string
  title: string
  question: string
  /** Pack-owned setup/task framing, shown above the question when present. */
  brief?: { setup: string; task: string }
  start: Netlist
  expectedStart: {
    ok: false
    code: string
    component_ids: string[]
    lit: false
  }
  fix: {
    wire: { a: string; b: string }
    hint: string
  }
  expectedFixed: ExpectedFixed
  claim: { type: string; component: string }
  seed: LessonSeed
}

export interface LessonPack extends Challenge {
  twist: Challenge
}
