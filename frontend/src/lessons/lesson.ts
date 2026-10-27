/** Generic lesson engine: prediction records and lesson-pack shapes.
 *
 * This module knows nothing about circuits. All circuit-specific content
 * (netlists, wires, expected outcomes) lives in the lesson packs. */

import type { Netlist } from '../api/client'

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

export interface LessonPack {
  id: string
  title: string
  question: string
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
  expectedFixed: {
    ok: true
    lit: true
    component: string
    current: number
    power: number
  }
  claim: { type: string; component: string }
  seed: LessonSeed
}
