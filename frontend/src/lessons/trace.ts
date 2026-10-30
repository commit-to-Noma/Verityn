/** Pure Evidence Trace model: prediction → build → simulate → compare.
 *
 * This module derives every trace step from data the client already
 * holds (prediction record, simulated netlist, solver result, verdict,
 * coach outcome). It never calls the backend, never judges circuits
 * itself, and never invents misconceptions: the coach step repeats the
 * guiding question Verityn actually received, with cautious framing.
 */

import type { Netlist, SimulateResult, VerdictStatus } from '../api/client'
import type { Choice, Prediction } from './lesson'
import { CHOICE_LABELS, LIT_POWER_W, compareWithExpected } from './lesson'

export interface NetlistRow {
  id: string
  kind: string
  detail: string
}

export type SolverSummary =
  | { ok: true; lit: { id: string; current: number; power: number }[]; darkBulbs: string[] }
  | { ok: false; code: string; message: string; offenders: string[] }

export interface EvidenceRow {
  id: string
  watts: number
}

export interface CoachRungTrace {
  rung: string
  text: string
  provider: string
  reply?: string
}

export type CoachTraceOutcome =
  | {
      phase: 'done'
      text: string
      provider: string
      learnerReply?: string
      rung?: string
      history?: CoachRungTrace[]
    }
  | { phase: 'unavailable'; message: string }

export type TraceBody =
  | { kind: 'prediction'; choiceLabel: string; why: string | null; question: string }
  | { kind: 'empty'; text: string }
  | { kind: 'circuit'; rows: NetlistRow[] }
  | { kind: 'solver'; summary: SolverSummary }
  | { kind: 'comparison'; status: VerdictStatus; note: string; evidence: EvidenceRow[] }
  | { kind: 'coach'; outcome: CoachTraceOutcome | null; hint: string }
  | { kind: 'demonstration'; events: DemoTraceEvent[] }

/** One recorded demonstration event; only actual occurrences are kept. */
export interface DemoTraceEvent {
  phase: 'proposed' | 'applied' | 'observed' | 'undone'
  label: string
}

export interface TraceStep {
  id: string
  title: string
  body: TraceBody
}

/** Fixed trace copy for solo challenges, where the coach stays off. */
export const SOLO_COACH_MESSAGE = 'Solo mode — the AI coach is off. Your reasoning and the simulator are enough.'

export interface TraceInput {
  prediction: Prediction | null
  question: string
  netlist: Netlist | null
  result: SimulateResult | null
  verdict: { status: VerdictStatus; evidence: Record<string, number> } | null
  /** Solver-verified pack expectation; null when the server verdict applies. */
  expectedLit: boolean | null
  coach: CoachTraceOutcome | null
  coachAvailable: boolean
  /** Demonstration timeline; only events that actually occurred. */
  demonstrations?: DemoTraceEvent[]
}

const KIND_LABELS: Record<string, string> = {
  battery: 'Battery',
  bulb: 'Bulb',
  switch: 'Switch',
  wire: 'Wire',
  resistor: 'Resistor',
}

/** One faithful row per simulated component, in netlist order. */
export function summarizeNetlist(netlist: Netlist): NetlistRow[] {
  return netlist.components.map((component) => {
    const kind = KIND_LABELS[component.type] ?? component.type
    const endpoints = `${component.a} ↔ ${component.b}`
    if (component.type === 'battery') {
      const volts = component.volts === undefined ? 'voltage unknown' : `${component.volts} V`
      return { id: component.id, kind, detail: `${volts} · ${endpoints}` }
    }
    if (component.type === 'switch') {
      const state = component.closed === undefined ? 'unknown' : component.closed ? 'closed' : 'open'
      return { id: component.id, kind, detail: `${state} · ${endpoints}` }
    }
    return { id: component.id, kind, detail: endpoints }
  })
}

/** Compact solver outcome: lit bulbs with facts, or the rejection. */
export function summarizeSolver(result: SimulateResult, netlist: Netlist): SolverSummary {
  if (!result.ok) {
    return {
      ok: false,
      code: result.error_code ?? 'ERROR',
      message: result.error_message,
      offenders: [...result.component_ids],
    }
  }
  const lit: { id: string; current: number; power: number }[] = []
  const darkBulbs: string[] = []
  for (const component of netlist.components) {
    if (component.type !== 'bulb') {
      continue
    }
    const measurement = result.components[component.id] ?? { current: 0, power: 0 }
    if (measurement.power > LIT_POWER_W) {
      lit.push({ id: component.id, current: measurement.current, power: measurement.power })
    } else {
      darkBulbs.push(component.id)
    }
  }
  return { ok: true, lit, darkBulbs }
}

function evidenceRows(evidence: Record<string, number>): EvidenceRow[] {
  return Object.entries(evidence).map(([key, watts]) => ({ id: key.split('.')[0] ?? key, watts }))
}

/** Assemble the trace steps from existing client-side evidence. */
export function buildTrace(input: TraceInput): TraceStep[] {
  const steps: TraceStep[] = [
    {
      id: 'prediction',
      title: 'Prediction',
      body:
        input.prediction === null
          ? { kind: 'empty', text: 'No prediction was recorded.' }
          : {
              kind: 'prediction',
              choiceLabel: CHOICE_LABELS[input.prediction.choice as Choice] ?? input.prediction.choice,
              why: input.prediction.why.trim() === '' ? null : input.prediction.why.trim(),
              question: input.question,
            },
    },
    {
      id: 'circuit',
      title: 'Circuit built',
      body:
        input.netlist === null || input.netlist.components.length === 0
          ? { kind: 'empty', text: 'No circuit has been tested yet.' }
          : { kind: 'circuit', rows: summarizeNetlist(input.netlist) },
    },
    {
      id: 'simulation',
      title: 'Simulation',
      body:
        input.result === null || input.netlist === null
          ? { kind: 'empty', text: 'Not simulated yet.' }
          : { kind: 'solver', summary: summarizeSolver(input.result, input.netlist) },
    },
  ]

  if (input.verdict !== null) {
    steps.push({
      id: 'comparison',
      title: 'Comparison',
      body: {
        kind: 'comparison',
        status: input.verdict.status,
        note: 'Checked by the deterministic evaluator against your built circuit.',
        evidence: evidenceRows(input.verdict.evidence),
      },
    })
  } else if (input.expectedLit !== null && input.prediction !== null) {
    const status = compareWithExpected(input.prediction.choice as Choice, input.expectedLit)
    steps.push({
      id: 'comparison',
      title: 'Comparison',
      body: {
        kind: 'comparison',
        status,
        note:
          status === 'UNASSESSABLE'
            ? 'No definite prediction was recorded, so there is nothing to check.'
            : 'Compared with the expected outcome for the starting circuit.',
        evidence: [],
      },
    })
  } else {
    const noDefinitePrediction = input.prediction?.choice === 'not_sure'
    steps.push({
      id: 'comparison',
      title: 'Comparison',
      body: {
        kind: 'comparison',
        status: 'UNASSESSABLE',
        note: noDefinitePrediction
          ? 'No definite prediction was recorded, so there is nothing to check.'
          : 'Test a complete circuit first — there is nothing to check yet.',
        evidence: [],
      },
    })
  }

  if (input.coachAvailable) {
    const hint =
      input.coach !== null
        ? ''
        : input.verdict?.status === 'CONTRADICTED'
          ? 'Your prediction did not match the circuit result — you have not asked the coach yet.'
          : input.verdict?.status === 'CONSISTENT'
            ? 'Your prediction matched the circuit result, so no coaching was offered.'
            : 'No coaching is available for this outcome yet.'
    steps.push({ id: 'coach', title: 'Coach', body: { kind: 'coach', outcome: input.coach, hint } })
  }

  if (input.demonstrations !== undefined && input.demonstrations.length > 0) {
    steps.push({
      id: 'demonstration',
      title: 'Demonstration',
      body: { kind: 'demonstration', events: input.demonstrations },
    })
  }

  return steps
}
