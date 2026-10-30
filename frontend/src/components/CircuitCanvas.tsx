import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CircleX, Eraser, Lightbulb, LoaderCircle, ToggleLeft, Zap } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Claim, Netlist, SimulateResult, VerdictResult, VerdictStatus } from '../api/client'
import { ApiError, askCoach, evaluateClaim, providerBadge, simulate } from '../api/client'
import { toNetlist } from '../canvas/toNetlist'
import type { CoachServerAction } from '../api/client'
import type { Demonstration } from '../coach/actions'
import {
  describeDemonstration,
  offerFromActions,
  previewTargets,
  validateServerActions,
} from '../coach/actions'
import type { CanvasImportRequest } from '../canvas/layout'
import { counterStarts } from '../canvas/layout'
import { flowForCurrent, glowIntensity } from '../canvas/visuals'
import type { Challenge, Choice, Prediction } from '../lessons/lesson'
import { LIT_POWER_W, choiceToClaim, compareWithExpected, matchesExpected } from '../lessons/lesson'
import type { CoachTraceOutcome, DemoTraceEvent, TraceInput } from '../lessons/trace'
import SpeakButton from '../voice/SpeakButton'
import { SOLO_COACH_MESSAGE } from '../lessons/trace'
import { VerdictIcon } from './verdict'
import { VERDICT_LABELS } from './verdictLabels'
import { explainLitVerdict } from '../verdict/explain'
import EvidenceTrace from './EvidenceTrace'
import ReadoutValue from './ReadoutValue'
import SoloResult from './SoloResult'
import PredictionSummary from './PredictionSummary'
import ResultBanner from './ResultBanner'
import SimulationResultView from './SimulationResultView'
import type { CircuitNodeType } from './canvas/CircuitNode'
import { circuitNodeTypes } from './canvas/nodeTypes'
import { SwitchToggleContext } from './canvas/switchToggle'
import type { LessonSeed } from '../lessons/lesson'

const FLOW_EDGE_STYLE: CSSProperties = { strokeWidth: 2, stroke: 'var(--color-flow)' }
const BAD_EDGE_STYLE: CSSProperties = { strokeWidth: 2, stroke: 'var(--color-bad)' }
const UNCERTAIN_EDGE_STYLE: CSSProperties = {
  strokeWidth: 2,
  stroke: 'var(--color-unknown)',
  strokeDasharray: '6 4',
}

type Tool = 'battery' | 'bulb' | 'switch' | 'delete' | null

type RunState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; result: SimulateResult; netlist: Netlist }
  | { phase: 'error'; message: string }

type VerdictState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; claim: Claim; verdict: VerdictResult; netlist: Netlist }
  | { phase: 'error'; message: string }

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function formatLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

function isValidWire(edge: Edge | Connection): boolean {
  if (!edge.source || !edge.target || !edge.sourceHandle || !edge.targetHandle) {
    return false
  }
  return !(edge.source === edge.target && edge.sourceHandle === edge.targetHandle)
}

function isClosedLoop(nodes: CircuitNodeType[], edges: Edge[]): boolean {
  if (nodes.length < 2 || !nodes.some((node) => node.data.kind === 'battery') ||
      !nodes.some((node) => node.data.kind === 'bulb')) {
    return false
  }
  const degree = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  if (!nodes.every((node) => (degree.get(node.id) ?? 0) >= 2)) {
    return false
  }
  const connected = new Set<string>([nodes[0].id])
  const queue = [nodes[0].id]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    for (const edge of edges) {
      const next = edge.source === current ? edge.target : edge.target === current ? edge.source : null
      if (next && !connected.has(next)) {
        connected.add(next)
        queue.push(next)
      }
    }
  }
  return connected.size === nodes.length
}

function seedNodes(seed: LessonSeed | undefined): CircuitNodeType[] {
  if (!seed) {
    return []
  }
  return seed.nodes
    .filter((node) => node.kind === 'battery' || node.kind === 'bulb' || node.kind === 'switch')
    .map((node) => ({
      id: node.id,
      type: 'circuit',
      position: { x: node.x, y: node.y },
      data: {
        kind: node.kind as 'battery' | 'bulb' | 'switch',
        label: node.id,
        glow: 0,
        invalid: false,
        closed: node.kind === 'switch' ? (node.closed ?? true) : true,
        polarity: node.polarity,
        review: node.review,
      },
    }))
}

function seedEdges(seed: LessonSeed | undefined): Edge[] {
  if (!seed) {
    return []
  }
  return seed.edges.map((edge) => ({
    id: edge.id,
    type: 'smoothstep',
    source: edge.source,
    sourceHandle: edge.sourceTerminal,
    target: edge.target,
    targetHandle: edge.targetTerminal,
    style: FLOW_EDGE_STYLE,
  }))
}

interface LadderRung {
  rung: string
  text: string
  provider: string
  ms: number
  reply: string | null
  actions: CoachServerAction[]
}

/** Served ladder cards + reflection drafts, kept above the verdict subtree so a
 * re-run (demonstration apply/undo, re-test) never wipes the learner's ladder. */
interface LadderMemory {
  rungs: LadderRung[]
  drafts: Record<string, string>
}

type LadderStatus =
  | { phase: 'idle' }
  | { phase: 'asking'; rung: string }
  | { phase: 'refused'; rung: string; message: string }
  | { phase: 'error'; rung: string; message: string }

const RUNGS = ['R1', 'R2', 'R4'] as const
const RUNG_ORDER: Record<string, number> = { R1: 0, R2: 1, R4: 2 }

const NEXT_LABEL: Record<string, string> = {
  R1: 'Ask the coach',
  R2: 'Show me the evidence (R2)',
  R4: 'Confirm before solo (R4)',
}

function rungCaption(provider: string): string | null {
  if (provider === 'prototype-fake') {
    return 'Deterministic prototype — no model call.'
  }
  if (provider === 'meta-spark') {
    return 'Guided by Meta Muse Spark · Grounded in simulator evidence.'
  }
  if (provider === 'deterministic') {
    return 'Built from solver measurements — no model call.'
  }
  return null
}

/** Guided-demo beat between served ladder rungs. */
const DEMO_ASK_BEAT_MS = 2000
/** Guided-demo beat before a scripted repair wire lands. */
const DEMO_BUILD_BEAT_MS = 2200
/** Guided-demo beat between an observed demonstration and its undo. */
const DEMO_UNDO_BEAT_MS = 2600

function CoachAsk({
  session,
  netlist,
  onResult,
  onInteract,
  onActions,
  demonstration,
  onDemonstrate,
  autoDemonstrate,
  autoAsk = false,
  demoSignal = 0,
  demoAppliedBefore = false,
  contradicted,
  ladderMemory,
  onLadderChange,
}: {
  session: string | null
  /** Null only while no run has been judged; the ladder asks only when visible. */
  netlist: Netlist | null
  onResult?: (outcome: CoachTraceOutcome) => void
  /** Fired when the learner starts reflecting, so demo mode holds. */
  onInteract?: () => void
  /** Server demonstration actions from the latest eligible answer. */
  onActions?: (actions: CoachServerAction[]) => void
  /** Consented diagram demonstration offered on the R2 card, if any. */
  demonstration?: Demonstration | null
  onDemonstrate?: (demo: Demonstration) => void
  /** Presenter mode: auto-apply a valid demonstration after a preview beat. */
  autoDemonstrate?: boolean
  /** Guided demo: ask each rung after a readable beat, through the real endpoint. */
  autoAsk?: boolean
  /** Guided demo: a change hurries the pending ask or demonstration apply. */
  demoSignal?: number
  /** A demonstration already ran on this canvas: never auto-apply twice,
   * even though verdict remounts reset the card-local demo flags. */
  demoAppliedBefore?: boolean
  /** False hides the ladder without unmounting, so served rungs survive verdict flips. */
  contradicted: boolean
  /** Canvas-owned memory that rehydrates the ladder after a verdict-subtree remount. */
  ladderMemory: { current: LadderMemory }
  /** Writes ladder progress back to canvas memory; the child never mutates the prop. */
  onLadderChange: (memory: LadderMemory) => void
}) {
  const [rungs, setRungs] = useState<LadderRung[]>(() => ladderMemory.current.rungs)
  const [status, setStatus] = useState<LadderStatus>({ phase: 'idle' })
  const [drafts, setDrafts] = useState<Record<string, string>>(() => ladderMemory.current.drafts)
  const [demoDismissed, setDemoDismissed] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const coachController = useRef<AbortController | null>(null)
  const rungsRef = useRef<LadderRung[]>(ladderMemory.current.rungs)
  const onActionsRef = useRef(onActions)
  const onDemonstrateRef = useRef(onDemonstrate)
  const demonstratedRef = useRef<Demonstration | null | undefined>(demonstration)
  const askRef = useRef<((rung: string) => void) | null>(null)

  useEffect(() => () => coachController.current?.abort(), [])
  useEffect(() => {
    rungsRef.current = rungs
    onLadderChange({ rungs, drafts })
  }, [rungs, drafts, onLadderChange])
  useEffect(() => {
    onActionsRef.current = onActions
    onDemonstrateRef.current = onDemonstrate
    demonstratedRef.current = demonstration
  })

  const r2Served = rungs.some((card) => card.rung === 'R2')
  const offerVisible =
    r2Served && demonstration !== null && demonstration !== undefined && !demoDismissed && !demoDone
  const autoPending = autoDemonstrate === true && offerVisible && !demoAppliedBefore
  // A demo skip is consumed by whichever beat is pending; anything idle
  // leaves it for the beat that is actually waiting.
  const signalRef = useRef(demoSignal)

  /** Presenter auto-apply: a visible preview beat, cancelled by any choice. */
  useEffect(() => {
    if (!autoPending) {
      return
    }
    const hurried = demoSignal !== signalRef.current
    signalRef.current = demoSignal
    const timer = window.setTimeout(() => {
      const demo = demonstratedRef.current
      if (demo !== null && demo !== undefined) {
        setDemoDone(true)
        onDemonstrateRef.current?.(demo)
      }
    }, hurried ? 60 : 2500)
    return () => window.clearTimeout(timer)
  }, [autoPending, demoSignal])

  const applyDemo = () => {
    const demo = demonstratedRef.current
    if (demo === null || demo === undefined) {
      return
    }
    onInteract?.()
    setDemoDone(true)
    onDemonstrate?.(demo)
  }

  const publish = (cards: LadderRung[]) => {
    const latest = cards[cards.length - 1]
    if (latest === undefined) {
      return
    }
    const r1 = cards.find((card) => card.rung === 'R1')
    onResult?.({
      phase: 'done',
      text: latest.text,
      provider: latest.provider,
      rung: latest.rung,
      learnerReply: r1?.reply ?? undefined,
      history: cards.map((card) => ({
        rung: card.rung,
        text: card.text,
        provider: card.provider,
        ...(card.reply === null ? {} : { reply: card.reply }),
      })),
    })
  }

  const ask = (rung: string) => {
    if (session === null) {
      const message = 'The prediction was not recorded, so no coaching was served.'
      setStatus({ phase: 'error', rung, message })
      onResult?.({ phase: 'unavailable', message })
      return
    }
    if (netlist === null) {
      return
    }
    coachController.current?.abort()
    const next = new AbortController()
    coachController.current = next
    setStatus({ phase: 'asking', rung })
    const started = performance.now()
    void (async () => {
      try {
        const answer = await askCoach(session, netlist, next.signal, rung)
        if (next.signal.aborted) {
          return
        }
        if (answer.eligible) {
          const ms = performance.now() - started
          const served = answer.rung ?? rung
          const card: LadderRung = {
            rung: served,
            text: answer.text,
            provider: answer.provider,
            ms,
            reply: null,
            actions: answer.actions,
          }
          onActionsRef.current?.(answer.actions)
          const cards = [...rungsRef.current.filter((entry) => entry.rung !== served), card].sort(
            (a, b) => (RUNG_ORDER[a.rung] ?? 99) - (RUNG_ORDER[b.rung] ?? 99),
          )
          rungsRef.current = cards
          setRungs(cards)
          setStatus({ phase: 'idle' })
          publish(cards)
        } else {
          setStatus({ phase: 'refused', rung, message: answer.message })
          if (rungsRef.current.length === 0) {
            onResult?.({ phase: 'unavailable', message: answer.message })
          }
        }
      } catch (err) {
        if (next.signal.aborted) {
          return
        }
        const message = err instanceof ApiError ? err.message : 'Request failed.'
        setStatus({ phase: 'error', rung, message })
        if (rungsRef.current.length === 0) {
          onResult?.({ phase: 'unavailable', message })
        }
      }
    })()
  }

  const saveReply = (rung: string) => {
    const thought = (drafts[rung] ?? '').trim()
    if (thought === '') {
      return
    }
    const cards = rungsRef.current.map((card) =>
      card.rung === rung ? { ...card, reply: thought } : card,
    )
    rungsRef.current = cards
    setRungs(cards)
    publish(cards)
  }

  const served = new Set(rungs.map((card) => card.rung))
  const nextRung: string | null = RUNGS.find((rung) => !served.has(rung)) ?? null

  useEffect(() => {
    askRef.current = ask
  })

  /** Guided demo: ask each rung through the real endpoint after a beat.
   * R4 waits until the demonstration is applied or declined, so the story
   * stays in order; a manual ask clears the pending timer by asking first. */
  useEffect(() => {
    if (!autoAsk || !contradicted || netlist === null || session === null) {
      return
    }
    if (status.phase !== 'idle' || nextRung === null) {
      return
    }
    const demoSettled =
      demoAppliedBefore ||
      demoDone ||
      demoDismissed ||
      demonstration === null ||
      demonstration === undefined
    if (nextRung === 'R4' && !demoSettled) {
      return
    }
    const hurried = demoSignal !== signalRef.current
    signalRef.current = demoSignal
    const rung = nextRung
    const timer = window.setTimeout(() => {
      askRef.current?.(rung)
    }, hurried ? 60 : DEMO_ASK_BEAT_MS)
    return () => window.clearTimeout(timer)
    // askRef mirrors the latest ask; the rung list drives re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoAsk,
    contradicted,
    netlist,
    session,
    status.phase,
    nextRung,
    demoAppliedBefore,
    demoDone,
    demoDismissed,
    demonstration,
    demoSignal,
  ])

  if (!contradicted) {
    return null
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {rungs.map((card) => {
        const caption = rungCaption(card.provider)
        const draft = drafts[card.rung] ?? ''
        const reflective = card.rung === 'R1' || card.rung === 'R4'
        return (
          <div key={card.rung} className="glass-panel flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <span className="border-glass-border w-fit rounded-full border px-3 py-1 text-xs font-medium text-ink">
                {providerBadge(card.provider, card.rung)}
              </span>
              <span className="text-ink-muted text-xs">
                answered in {formatLatency(card.ms)}
              </span>
            </div>
            <p className="text-base">{card.text}</p>
            {caption !== null && <p className="text-ink-muted text-xs">{caption}</p>}
            <div>
              <SpeakButton text={card.text} />
            </div>
            {card.rung === 'R2' &&
              demonstration !== null &&
              demonstration !== undefined &&
              !demoDismissed &&
              !demoDone && (
                <div className="border-glass-border flex flex-col gap-2 rounded-[10px] border p-3">
                  <p className="text-sm">{describeDemonstration(demonstration)}</p>
                  {autoPending && (
                    <p className="text-ink-muted text-xs" role="status">
                      Presenter mode: auto-applying the demonstration…
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyDemo}
                      className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
                    >
                      Show me
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoDismissed(true)}
                      className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
                    >
                      Keep circuit unchanged
                    </button>
                  </div>
                </div>
              )}
            {card.rung === 'R2' && demoDone && (
              <p className="text-ink-muted text-xs">
                Demonstrated on your canvas — the simulator judges the result. Undo is beside
                the canvas controls.
              </p>
            )}
            {reflective &&
              (card.reply === null ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveReply(card.rung)
                  }}
                >
                  <label
                    htmlFor={card.rung === 'R1' ? 'coach-reply' : 'coach-r4-reply'}
                    className="text-sm font-medium"
                  >
                    {card.rung === 'R1' ? (
                      <>
                        Complete the thought:{' '}
                        <span className="text-ink-muted font-normal">An open switch…</span>
                      </>
                    ) : (
                      'In your own words, why?'
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={card.rung === 'R1' ? 'coach-reply' : 'coach-r4-reply'}
                      type="text"
                      value={draft}
                      maxLength={140}
                      autoComplete="off"
                      placeholder="One line is enough"
                      onFocus={() => onInteract?.()}
                      onChange={(event) => {
                        onInteract?.()
                        setDrafts((prev) => ({ ...prev, [card.rung]: event.target.value }))
                      }}
                      className="border-glass-border min-h-[44px] w-full rounded-[10px] border px-3 text-base"
                    />
                    <button
                      type="submit"
                      disabled={draft.trim() === ''}
                      className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-ink-muted text-sm">
                  <span className="font-medium text-ink">
                    {card.rung === 'R1' ? 'Your thought:' : 'Your confirmation:'}
                  </span>{' '}
                  {card.reply}
                </p>
              ))}
          </div>
        )
      })}
      {status.phase === 'asking' && (
        <div className="glass-panel flex items-center gap-3 p-4">
          <LoaderCircle className="text-flow h-5 w-5 animate-spin" aria-hidden="true" />
          <p className="text-ink-muted text-sm">Asking the coach…</p>
        </div>
      )}
      {status.phase === 'refused' && (
        <div className="glass-panel flex flex-col gap-2 p-4">
          <p className="text-ink-muted text-sm">{status.message}</p>
          <div>
            <button
              type="button"
              onClick={() => ask(status.rung)}
              className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
            >
              Retry {status.rung}
            </button>
          </div>
        </div>
      )}
      {/* Genuine provider failure with no usable fallback response: labeled
          honestly, never disguised as coaching. Retryable via Try again. */}
      {status.phase === 'error' && (
        <div className="glass-panel flex flex-col gap-2 p-4" role="alert">
          <p className="text-base font-medium text-ink">Coach unavailable</p>
          <p className="text-ink-muted text-sm">{status.message}</p>
          <div>
            <button
              type="button"
              onClick={() => ask(status.rung)}
              className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      )}
      {nextRung !== null && status.phase === 'idle' && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => ask(nextRung)}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            {NEXT_LABEL[nextRung] ?? 'Ask the coach'}
          </button>
        </div>
      )}
      {nextRung === null && status.phase === 'idle' && (
        <p className="text-ink-muted text-xs">
          Ladder complete — the solo stage runs with the coach off.
        </p>
      )}
    </div>
  )
}

/** Prediction-vs-observed card for the lesson's starting circuit.
 *
 * Used where the evaluator correctly refuses to judge (the broken
 * start, e.g. L1): the comparison runs against the pack's
 * solver-verified expected outcome. Repair measurements come only
 * from a solved result — a rejected circuit shows no repair block,
 * since inventing amps or watts would fabricate evidence. */
function StartVerdict({
  prediction,
  challenge,
  result,
}: {
  prediction: Prediction
  challenge: Challenge
  result: SimulateResult
}) {
  const status = compareWithExpected(prediction.choice, challenge.expectedStart.lit)
  const component = challenge.claim.component
  const would =
    prediction.choice === 'not_sure' ? null : prediction.choice === 'yes' ? 'light' : 'stay dark'
  const observedText = challenge.expectedStart.lit
    ? `${component} lights`
    : `${component} stays dark`
  const measured = result.ok ? result.components[component] : undefined
  const verified = measured !== undefined && matchesExpected(result, challenge.expectedFixed)
  return (
    <div className="glass-panel flex flex-col gap-1 p-4" aria-live="polite">
      <p className="text-flow mb-1 text-xs font-semibold uppercase tracking-[0.18em]">
        Original setup evidence
      </p>
      <p className="text-base font-medium text-ink">Your original prediction</p>
      <div className="flex items-center gap-3">
        <VerdictIcon status={status} />
        <div>
          <p className="text-base font-medium text-ink">{VERDICT_LABELS[status]}</p>
          <p className="text-ink-muted text-sm">
            {would === null ? (
              'You made no definite prediction about the open circuit.'
            ) : (
              <>
                Your initial prediction was that the open circuit would {would}.
              </>
            )}
          </p>
        </div>
      </div>
      <p className="text-base font-medium text-ink">What the simulator observed</p>
      <p className="text-ink-muted pl-9 text-sm">{observedText} in the starting circuit.</p>
      {measured !== undefined && (
        <>
          <p className="text-base font-medium text-ink">
            {verified ? 'You completed the loop' : 'Tested circuit'}
          </p>
          <p className="text-ink-muted pl-9 text-sm">
            {verified ? 'Your completed circuit produces ' : 'Your circuit as built produces '}
            <ReadoutValue value={measured.current} unit="A" />
            {' and '}
            <ReadoutValue value={measured.power} unit="W" />
            .
          </p>
        </>
      )}
      <p className="text-ink-muted pl-9 text-xs">
        Compared with the verified outcome of the starting circuit.
      </p>
      <p className="text-ink-muted pl-9 text-xs">
        This tests your prediction against the model, not you.
      </p>
    </div>
  )
}

/** Prediction-vs-observed card for a judged run. Extracted so the coach ladder below
 * it keeps its own mount across verdict re-checks. */
function DoneVerdictCard({
  state,
  observed,
}: {
  state: Extract<VerdictState, { phase: 'done' }>
  /** Solver measurement for the claimed component, when the run solved. */
  observed?: { current: number; power: number }
}) {
  // Never headline the learner's claim on its own: after a failed
  // prediction the claim text ("L1 lights") would contradict the
  // observed evidence shown beside it. Both sides stay explicit.
  const predictionText =
    state.claim.type === 'lit'
      ? state.claim.value
        ? `${state.claim.component} lights`
        : `${state.claim.component} stays dark`
      : 'Prediction checked'
  const observedText =
    observed === undefined || state.claim.type !== 'lit'
      ? null
      : observed.power > LIT_POWER_W
        ? `${state.claim.component} lights`
        : `${state.claim.component} stays dark`
  const explanation =
    observed !== undefined && state.claim.type === 'lit' && state.verdict.status !== 'UNASSESSABLE'
      ? explainLitVerdict({
          status: state.verdict.status,
          component: state.claim.component,
          predictedLit: state.claim.value,
          power: observed.power,
          netlist: state.netlist,
        })
      : null
  return (
    <div className="glass-panel flex flex-col gap-1 p-4" aria-live="polite">
      <p className="text-flow mb-1 text-xs font-semibold uppercase tracking-[0.18em]">
        Repaired setup evidence
      </p>
      <div className="flex items-center gap-3">
        <VerdictIcon status={state.verdict.status} />
        <div>
          <p className="text-base font-medium text-ink">{VERDICT_LABELS[state.verdict.status]}</p>
          <p className="text-ink-muted text-sm">
            <span className="font-medium text-ink">Your prediction:</span> {predictionText}
          </p>
          {observed !== undefined && observedText !== null && (
            <p className="text-ink-muted text-sm">
              <span className="font-medium text-ink">Observed:</span> {observedText}
              {' · '}
              <ReadoutValue value={observed.current} unit="A" />
              {' · '}
              <ReadoutValue value={observed.power} unit="W" />
            </p>
          )}
          {explanation !== null && <p className="text-ink-muted text-sm">{explanation}</p>}
        </div>
      </div>
      {Object.entries(state.verdict.evidence).map(([key, power]) => {
        const [cid] = key.split('.')
        return (
          <p key={key} className="text-ink-muted pl-9 text-sm">
            <span className="font-mono">{cid}</span>
            {' · '}
            <ReadoutValue value={power} unit="W" />
          </p>
        )
      })}
      <p className="text-ink-muted pl-9 text-xs">
        This tests your prediction against the model, not you.
      </p>
    </div>
  )
}

function ClaimVerdict({
  state,
  choice,
  session,
  observed,
  onRetry,
  onCoached,
  onCoachInteract,
  coachEnabled,
  demonstration,
  onDemonstrate,
  onActions,
  autoDemonstrate,
  autoAsk,
  demoSignal,
  demoAppliedBefore,
  renderDone,
  ladderMemory,
  onLadderChange,
}: {
  state: VerdictState
  choice: Choice
  session: string | null
  /** Solver measurement for the claimed component, when the run solved. */
  observed?: { current: number; power: number }
  onRetry: () => void
  onCoached?: (outcome: CoachTraceOutcome) => void
  onCoachInteract?: () => void
  coachEnabled: boolean
  demonstration?: Demonstration | null
  onDemonstrate?: (demo: Demonstration) => void
  onActions?: (actions: CoachServerAction[]) => void
  autoDemonstrate?: boolean
  autoAsk?: boolean
  demoSignal?: number
  demoAppliedBefore?: boolean
  /** Solo mode renders the four-beat result instead of the plain verdict card. */
  renderDone?: () => ReactNode
  ladderMemory: { current: LadderMemory }
  onLadderChange: (memory: LadderMemory) => void
}) {
  // The ladder stays mounted across idle/checking/done so served rungs survive
  // demonstration verdict flips; only the judged netlist is ever asked about.
  // The netlist is null while unjudged: the ladder can only ask when visible,
  // and visibility implies a judged run, so no render-time memory is needed.
  const contradicted = state.phase === 'done' && state.verdict.status === 'CONTRADICTED'
  return (
    <>
      {state.phase === 'idle' && (
        <div className="glass-panel p-4" aria-live="polite">
          <p className="text-ink-muted text-sm">
            {choice === 'not_sure'
              ? 'You chose Not sure, so there is no definite prediction to check.'
              : 'This prediction cannot be checked yet.'}
          </p>
        </div>
      )}
      {state.phase === 'checking' && (
        <div className="glass-panel flex items-center gap-3 p-4" aria-live="polite">
          <LoaderCircle className="text-flow h-5 w-5 animate-spin" aria-hidden="true" />
          <p className="text-ink-muted text-sm">Checking your prediction against the circuit result…</p>
        </div>
      )}
      {state.phase === 'done' &&
        (renderDone !== undefined ? (
          renderDone()
        ) : (
          <DoneVerdictCard state={state} observed={observed} />
        ))}
      {state.phase === 'error' && (
        <div className="glass-panel flex items-center gap-3 p-4" role="alert">
          <CircleX className="text-bad h-6 w-6 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base">{state.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}
      {coachEnabled && (
        <CoachAsk
          session={session}
          netlist={state.phase === 'done' ? state.netlist : null}
          onResult={onCoached}
          onInteract={onCoachInteract}
          onActions={onActions}
          demonstration={demonstration}
          onDemonstrate={onDemonstrate}
          autoDemonstrate={autoDemonstrate}
          autoAsk={autoAsk}
          demoSignal={demoSignal}
          demoAppliedBefore={demoAppliedBefore}
          contradicted={contradicted}
          ladderMemory={ladderMemory}
          onLadderChange={onLadderChange}
        />
      )}
    </>
  )
}

const DEFAULT_INSTRUCTIONS =
  'Place a battery and bulb, then connect every glowing terminal dot. We will test the circuit as soon as the loop closes.'

/** Guided-demo repair: scripted wires through the normal connect path. */
export interface CanvasDemoBuild {
  connections: Array<{
    source: string
    sourceTerminal: string
    target: string
    targetTerminal: string
  }>
}

function CanvasInner({
  seed,
  eyebrow = 'Build',
  instructions = DEFAULT_INSTRUCTIONS,
  choice,
  claim,
  coachSession,
  onSolved,
  onDirty,
  onVerdict,
  onCoachDone,
  onCoachInteract,
  onEvidence,
  prediction,
  challenge,
  solo = false,
  layout = 'split',
  mode = 'lesson',
  runRequest,
  title = 'Build what you predicted',
  importRequest,
  gate,
  simulateLocked = null,
  peerSelection = null,
  onPeerSelect,
  autoDemonstrate = false,
  autoAsk = false,
  demoSignal = 0,
  demoBuild = null,
  demoPaused = false,
  demoAutoUndo = false,
  onDemoTakeover,
}: {
  seed?: LessonSeed
  eyebrow?: string
  instructions?: string
  choice?: Choice
  claim?: { type: string; component: string }
  coachSession?: string | null
  onSolved?: (result: SimulateResult, netlist: Netlist) => void
  /** Locks Test + auto-run until review confirms; the string is the reason. */
  simulateLocked?: string | null
  /** Externally selected node/edge id, mirrored onto canvas selection. */
  peerSelection?: string | null
  /** Fired when the learner selects a node/edge (null on pane click). */
  onPeerSelect?: (id: string | null) => void
  /** Presenter mode: auto-apply a valid demonstration after a preview beat. */
  autoDemonstrate?: boolean
  /** Guided demo: ask each ladder rung after a beat, through the real endpoint. */
  autoAsk?: boolean
  /** Guided demo: a change hurries the pending build, ask, or undo. */
  demoSignal?: number
  /** Guided demo: scripted repair wires, applied through the normal path. */
  demoBuild?: CanvasDemoBuild | null
  /** Guided demo: while paused, no demo timer runs. */
  demoPaused?: boolean
  /** Guided demo: undo the demonstration after the observed reading lands. */
  demoAutoUndo?: boolean
  /** Guided demo: a manual structural edit hands the canvas to the learner. */
  onDemoTakeover?: () => void
  /** Fired whenever the canvas edits invalidate the last result. */
  onDirty?: () => void
  /** Fired when the server verdict for the recorded prediction arrives. */
  onVerdict?: (status: VerdictStatus) => void
  /** Fired when the coach answers (reality check only; never in solo). */
  onCoachDone?: (outcome?: CoachTraceOutcome) => void
  /** Fired when the learner starts a coach reflection. */
  onCoachInteract?: () => void
  /** Fired with the evidence-trace input for journey recaps. */
  onEvidence?: (chapterId: string, input: TraceInput) => void
  prediction?: Prediction | null
  challenge?: Challenge
  solo?: boolean
  importRequest?: CanvasImportRequest | null
  /** Two-column experiment/insight layout (`split`) or single stacked column. */
  layout?: 'split' | 'stacked'
  /** Free-bench behavior: no auto-run, Run/Reset labels, ready/stale copy. */
  mode?: 'lesson' | 'experiment'
  /** A change runs the solver once through the normal path (preset Test). */
  runRequest?: number
  /** Canvas heading; lessons keep the default prediction framing. */
  title?: string
  /** Chapter gate, rendered below the result and above the evidence trace. */
  gate?: ReactNode
}) {
  const initialSeed = importRequest?.seed ?? seed
  const initialUncertain = importRequest?.uncertainIds ?? []
  const [nodes, setNodes, onNodesChange] = useNodesState<CircuitNodeType>(seedNodes(initialSeed))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    seedEdges(initialSeed).map((edge) => ({
      ...edge,
      style: initialUncertain.includes(edge.id) ? UNCERTAIN_EDGE_STYLE : FLOW_EDGE_STYLE,
    })),
  )
  const { screenToFlowPosition } = useReactFlow()
  const [tool, setTool] = useState<Tool>(null)
  const [runState, setRunState] = useState<RunState>({ phase: 'idle' })
  /** Experiment copy: idle after a run means the circuit changed. */
  const ranOnceRef = useRef(false)
  const [verdictState, setVerdictState] = useState<VerdictState>({ phase: 'idle' })
  const [coachOutcome, setCoachOutcome] = useState<CoachTraceOutcome | null>(null)
  const ladderMemory = useRef<LadderMemory>({ rungs: [], drafts: {} })
  const handleLadderChange = useCallback((memory: LadderMemory) => {
    ladderMemory.current = memory
  }, [])
  const [serverActions, setServerActions] = useState<CoachServerAction[]>([])
  const [demoEvents, setDemoEvents] = useState<DemoTraceEvent[]>([])
  const [demoUndo, setDemoUndo] = useState<{ nodes: CircuitNodeType[]; edges: Edge[] } | null>(null)
  const demoObserve = useRef<{ demo: Demonstration; show: boolean } | null>(null)
  const uncertainRef = useRef<string[]>(initialUncertain)
  const requestId = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const counters = useRef({
    ...counterStarts(seedNodes(initialSeed)),
    wire: initialSeed?.edges.length ?? 0,
  })
  // Callback mirrors: orchestration events must not re-fire on parent renders.
  const onDirtyRef = useRef(onDirty)
  const onVerdictRef = useRef(onVerdict)
  const onCoachDoneRef = useRef(onCoachDone)
  const onEvidenceRef = useRef(onEvidence)
  const onDemoTakeoverRef = useRef(onDemoTakeover)
  useEffect(() => {
    onDirtyRef.current = onDirty
    onVerdictRef.current = onVerdict
    onCoachDoneRef.current = onCoachDone
    onEvidenceRef.current = onEvidence
    onDemoTakeoverRef.current = onDemoTakeover
  })

  /** Latest nodes for demo timers scheduled after state commits. */
  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  })

  /** True while the demo or a consented demonstration mutates the canvas;
   * only a real manual edit takes the demo over. */
  const programmatic = useRef(false)
  const noteManualEdit = () => {
    if (!programmatic.current) {
      onDemoTakeoverRef.current?.()
    }
  }

  useEffect(() => () => controller.current?.abort(), [])

  const invalidate = () => {
    controller.current?.abort()
    requestId.current += 1
    setRunState({ phase: 'idle' })
    setNodes((current) =>
      current.map((node) => {
        if (node.data.glow > 0 || node.data.invalid || node.data.demonstrated === true) {
          return {
            ...node,
            data: {
              ...node.data,
              glow: 0,
              invalid: false,
              measurement: undefined,
              demonstrated: false,
            },
          }
        }
        if (node.data.measurement) {
          return { ...node, data: { ...node.data, measurement: undefined } }
        }
        return node
      }),
    )
    setEdges((current) =>
      current.map((edge) => ({
        ...edge,
        style: uncertainRef.current.includes(edge.id) ? UNCERTAIN_EDGE_STYLE : FLOW_EDGE_STYLE,
        animated: false,
        className: undefined,
      })),
    )
    setVerdictState({ phase: 'idle' })
    setCoachOutcome(null)
    onDirtyRef.current?.()
  }

  const toggleSwitch = (id: string) => {
    noteManualEdit()
    setNodes((current) =>
      current.map((node) =>
        node.id === id && node.data.kind === 'switch'
          ? { ...node, data: { ...node.data, closed: !node.data.closed } }
          : node,
      ),
    )
    invalidate()
  }

  const handleNodesChange = (changes: NodeChange<CircuitNodeType>[]) => {
    onNodesChange(changes)
    const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
    if (removed.length > 0) {
      const gone = new Set(removed)
      setEdges((current) => current.filter((edge) => !gone.has(edge.source) && !gone.has(edge.target)))
    }
    if (changes.some((change) => change.type === 'add' || change.type === 'remove' || change.type === 'replace')) {
      invalidate()
    }
  }

  const handleEdgesChange = (changes: EdgeChange<Edge>[]) => {
    onEdgesChange(changes)
    if (changes.some((change) => change.type === 'add' || change.type === 'remove' || change.type === 'replace')) {
      invalidate()
    }
  }

  const placeAt = (clientX: number, clientY: number) => {
    if (tool !== 'battery' && tool !== 'bulb' && tool !== 'switch') {
      return
    }
    noteManualEdit()
    const position = screenToFlowPosition({ x: clientX, y: clientY })
    counters.current[tool] += 1
    const prefix = tool === 'battery' ? 'B' : tool === 'bulb' ? 'L' : 'S'
    const id = `${prefix}${counters.current[tool]}`
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'circuit',
        position: { x: Math.round(position.x / 20) * 20, y: Math.round(position.y / 20) * 20 },
        data: {
          kind: tool,
          label: id,
          glow: 0,
          invalid: false,
          closed: true,
        },
      },
    ])
    invalidate()
  }

  const placeToolAt = (kind: Exclude<Tool, 'delete' | null>, clientX: number, clientY: number) => {
    noteManualEdit()
    setTool(kind)
    const position = screenToFlowPosition({ x: clientX, y: clientY })
    counters.current[kind] += 1
    const prefix = kind === 'battery' ? 'B' : kind === 'bulb' ? 'L' : 'S'
    const id = `${prefix}${counters.current[kind]}`
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'circuit',
        position: { x: Math.round(position.x / 20) * 20, y: Math.round(position.y / 20) * 20 },
        data: {
          kind,
          label: id,
          glow: 0,
          invalid: false,
          closed: true,
        },
      },
    ])
    invalidate()
  }

  const handlePaletteDragStart = (
    event: DragEvent<HTMLButtonElement>,
    kind: Exclude<Tool, 'delete' | null>,
  ) => {
    event.dataTransfer.setData('application/verityn-component', kind)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const removeNode = (id: string) => {
    noteManualEdit()
    setNodes((current) => current.filter((node) => node.id !== id))
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id))
    invalidate()
  }

  const onConnect = (connection: Connection) => {
    noteManualEdit()
    counters.current.wire += 1
    const id = `W${counters.current.wire}`
    setEdges((current) =>
      addEdge({ ...connection, id, type: 'smoothstep', style: FLOW_EDGE_STYLE }, current),
    )
    invalidate()
  }

  const clear = () => {
    noteManualEdit()
    setNodes([])
    setEdges([])
    uncertainRef.current = []
    setDemoUndo(null)
    demoObserve.current = null
    invalidate()
  }

  const run = useCallback(() => {
    if (simulateLocked !== null) {
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    requestId.current += 1
    const id = requestId.current
    setRunState({ phase: 'loading' })
    const netlist = toNetlist({
      nodes: nodes.map((node) => ({ id: node.id, kind: node.data.kind, closed: node.data.closed })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceTerminal: edge.sourceHandle ?? '',
        target: edge.target,
        targetTerminal: edge.targetHandle ?? '',
      })),
    })
    void (async () => {
      try {
        const result = await simulate(netlist, next.signal)
        if (requestId.current !== id) {
          return
        }
        const offenders = new Set(result.component_ids)
        setNodes((current) =>
          current.map((node) => ({
            ...node,
            data: {
              ...node.data,
              glow:
                result.ok && node.data.kind === 'bulb'
                  ? glowIntensity(result.components[node.id]?.power ?? 0)
                  : 0,
              invalid: offenders.has(node.id),
              measurement: result.ok ? result.components[node.id] : undefined,
            },
          })),
        )
        setEdges((current) =>
          current.map((edge) => {
            const bad = offenders.has(edge.id)
            const flow = bad
              ? 'still'
              : flowForCurrent(result.components[edge.id]?.current ?? 0)
            return {
              ...edge,
              style: bad
                ? BAD_EDGE_STYLE
                : uncertainRef.current.includes(edge.id)
                  ? UNCERTAIN_EDGE_STYLE
                  : FLOW_EDGE_STYLE,
              animated: flow !== 'still',
              className: flow === 'reverse' ? 'flow-reverse' : undefined,
            }
          }),
        )
        setRunState({ phase: 'done', result, netlist })
        ranOnceRef.current = true
        // Lessons only report solved runs; the free bench also reports
        // rejections (history + explanations need them). The verdict
        // block below stays lesson-gated on choice && claim.
        if (result.ok || mode === 'experiment') {
          onSolved?.(result, netlist)
          const verdictClaim = choice && claim ? choiceToClaim(choice, claim) : null
          if (verdictClaim) {
            setVerdictState({ phase: 'checking' })
            try {
              const judged = await evaluateClaim(verdictClaim, netlist, next.signal)
              if (requestId.current !== id) {
                return
              }
              setVerdictState({
                phase: 'done',
                claim: verdictClaim,
                verdict: judged.verdict,
                netlist,
              })
            } catch (verdictErr) {
              if (next.signal.aborted || requestId.current !== id) {
                return
              }
              setVerdictState({
                phase: 'error',
                message: verdictErr instanceof ApiError ? verdictErr.message : 'Request failed.',
              })
            }
          }
        }
      } catch (err) {
        if (next.signal.aborted || requestId.current !== id) {
          return
        }
        setRunState({
          phase: 'error',
          message: err instanceof ApiError ? err.message : 'Request failed.',
        })
      }
    })()
  }, [edges, nodes, onSolved, setEdges, setNodes, choice, claim, simulateLocked, mode])

  const loopClosed = isClosedLoop(nodes, edges)

  /** Preset Test: a runRequest change runs once through the normal path.
   * The timer clears StrictMode's simulated unmount (whose abort cleanup
   * would otherwise kill a fetch started mid-mount); the guard is set
   * inside the callback so the re-run effect still schedules. Lessons
   * never pass the prop. */
  const runRequestRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (runRequest === undefined || runRequest === runRequestRef.current) {
      return
    }
    const timer = window.setTimeout(() => {
      runRequestRef.current = runRequest
      run()
    }, 60)
    return () => window.clearTimeout(timer)
  }, [runRequest, run])

  useEffect(() => {
    if (
      mode === 'experiment' ||
      !loopClosed ||
      runState.phase !== 'idle' ||
      simulateLocked !== null
    ) {
      return
    }
    const timer = window.setTimeout(run, 450)
    return () => window.clearTimeout(timer)
  }, [mode, loopClosed, runState.phase, nodes, edges, run, simulateLocked])

  /** Mirror an externally selected peer (review panel) onto the canvas. */
  useEffect(() => {
    if (peerSelection === null) {
      return
    }
    setNodes((current) =>
      current.map((node) =>
        node.id === peerSelection
          ? node.selected === true
            ? node
            : { ...node, selected: true }
          : node.selected === true
            ? { ...node, selected: false }
            : node,
      ),
    )
    setEdges((current) =>
      current.map((edge) =>
        edge.id === peerSelection
          ? edge.selected === true
            ? edge
            : { ...edge, selected: true }
          : edge.selected === true
            ? { ...edge, selected: false }
            : edge,
      ),
    )
  }, [peerSelection, setNodes, setEdges])

  useEffect(() => {
    if (verdictState.phase === 'done') {
      onVerdictRef.current?.(verdictState.verdict.status)
    }
  }, [verdictState])

  /** Guided-demo repair: scripted wires through the same path as a drag.
   *
   * The endpoints stay selected (highlighted) until the wire lands; the
   * normal converter and auto-run judge whatever results. Missing nodes
   * (deleted mid-beat) stall honestly instead of inventing edges. */
  const demoAppliedRef = useRef<CanvasDemoBuild | null>(null)
  const demoSignalRef = useRef(demoSignal)
  useEffect(() => {
    if (demoBuild === null || demoPaused || demoAppliedRef.current === demoBuild) {
      return
    }
    const endpoints = new Set(
      demoBuild.connections.flatMap((connection) => [connection.source, connection.target]),
    )
    setNodes((current) =>
      current.map((node) =>
        endpoints.has(node.id) && node.selected !== true ? { ...node, selected: true } : node,
      ),
    )
    const hurried = demoSignal !== demoSignalRef.current
    demoSignalRef.current = demoSignal
    const request = demoBuild
    const timer = window.setTimeout(
      () => {
        programmatic.current = true
        try {
          const ids = new Set(nodesRef.current.map((node) => node.id))
          const missing = request.connections.some(
            (connection) => !ids.has(connection.source) || !ids.has(connection.target),
          )
          if (!missing) {
            setEdges((current) => {
              const next = [...current]
              for (const connection of request.connections) {
                counters.current.wire += 1
                next.push({
                  id: `W${counters.current.wire}`,
                  type: 'smoothstep',
                  source: connection.source,
                  sourceHandle: connection.sourceTerminal,
                  target: connection.target,
                  targetHandle: connection.targetTerminal,
                  style: FLOW_EDGE_STYLE,
                })
              }
              return next
            })
            setNodes((current) =>
              current.map((node) =>
                endpoints.has(node.id) && node.selected === true
                  ? { ...node, selected: false }
                  : node,
              ),
            )
            demoAppliedRef.current = request
            invalidate()
          }
        } finally {
          programmatic.current = false
        }
      },
      hurried ? 60 : DEMO_BUILD_BEAT_MS,
    )
    return () => {
      window.clearTimeout(timer)
      setNodes((current) =>
        current.map((node) =>
          endpoints.has(node.id) && node.selected === true ? { ...node, selected: false } : node,
        ),
      )
    }
    // The scripted request is stable per stage; pause/signal drive re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoBuild, demoPaused, demoSignal])

  useEffect(() => {
    if (runState.phase !== 'done' || !prediction || !challenge) {
      return
    }
    onEvidenceRef.current?.(challenge.id, {
      prediction,
      question: challenge.question,
      netlist: runState.netlist,
      result: runState.result,
      verdict:
        verdictState.phase === 'done'
          ? { status: verdictState.verdict.status, evidence: verdictState.verdict.evidence }
          : null,
      expectedLit: choice === undefined ? challenge.expectedStart.lit : null,
      coach: solo ? { phase: 'unavailable', message: SOLO_COACH_MESSAGE } : coachOutcome,
      coachAvailable: choice !== undefined || solo,
      demonstrations: demoEvents.length > 0 ? demoEvents : undefined,
    })
  }, [runState, verdictState, coachOutcome, prediction, challenge, choice, solo, demoEvents])

  const handleCoached = (outcome: CoachTraceOutcome) => {
    setCoachOutcome(outcome)
    if (outcome.phase === 'done') {
      onCoachDoneRef.current?.(outcome)
    }
  }

  const toggleTool = (next: Exclude<Tool, null>) => {
    setTool((current) => (current === next ? null : next))
  }

  /** Latest run, for solver re-judges scheduled after state commits. */
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })

  /** Consented demonstration: server actions first, canvas fallback second. */
  const acceptedActions = validateServerActions(
    serverActions,
    nodes.map((node) => ({ id: node.id, kind: node.data.kind, closed: node.data.closed })),
  ).accepted
  const demonstration: Demonstration | null = (() => {
    const sw = nodes.find((node) => node.data.kind === 'switch')
    const fallback: Demonstration | null =
      sw !== undefined
        ? { action: sw.data.closed ? 'open_switch' : 'close_switch', target: sw.id }
        : claim !== undefined
          ? { action: 'highlight_path', target: claim.component }
          : null
    return offerFromActions(acceptedActions, fallback)
  })()

  const describeReading = (demo: Demonstration): string => {
    if (runState.phase !== 'done') {
      return `${demo.target} was not simulated.`
    }
    if (!runState.result.ok) {
      return `the circuit is invalid (${runState.result.error_code}).`
    }
    const bulbs = runState.netlist.components
      .filter((part) => part.type === 'bulb')
      .map((part) => {
        const reading = runState.result.ok ? runState.result.components[part.id] : undefined
        return `${part.id} ${reading?.power?.toFixed(1) ?? '?'} W`
      })
    return bulbs.length > 0 ? bulbs.join(', ') : 'no bulb measured.'
  }

  const handleDemonstrate = (demo: Demonstration) => {
    programmatic.current = true
    try {
      setDemoUndo({
        nodes: nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } })),
        edges: edges.map((edge) => ({ ...edge })),
      })
      setDemoEvents((prev) => [...prev, { phase: 'proposed', label: describeDemonstration(demo) }])
      // A demonstration is a reversible coach excursion: the served rungs stay
      // recorded even though the toggle invalidates the canvas around them.
      const keptCoach = coachOutcome
      // Switch actions reuse the manual toggle path, guarded by live state.
      if (demo.action !== 'highlight_path') {
        const sw = nodes.find((node) => node.id === demo.target && node.data.kind === 'switch')
        if (demo.action === 'open_switch' && sw !== undefined && sw.data.closed) {
          toggleSwitch(sw.id)
        } else if (demo.action === 'close_switch' && sw !== undefined && !sw.data.closed) {
          toggleSwitch(sw.id)
        }
      }
      setCoachOutcome(keptCoach)
    } finally {
      programmatic.current = false
    }
    const preview = new Set([...previewTargets(acceptedActions), demo.target])
    setNodes((current) =>
      current.map((node) =>
        preview.has(node.id) ? { ...node, data: { ...node.data, demonstrated: true } } : node,
      ),
    )
    setDemoEvents((prev) => [...prev, { phase: 'applied', label: describeDemonstration(demo) }])
    demoObserve.current = {
      demo,
      show: acceptedActions.some((action) => action.type === 'show_measurement'),
    }
    // The solver judges the committed canvas state, never the stale closure.
    window.setTimeout(() => runRef.current(), 60)
  }

  const handleDemoUndo = () => {
    if (demoUndo === null) {
      return
    }
    programmatic.current = true
    try {
      const snapshot = demoUndo
      const keptCoach = coachOutcome
      setDemoUndo(null)
      setNodes(snapshot.nodes)
      setEdges(snapshot.edges)
      invalidate()
      setCoachOutcome(keptCoach)
    } finally {
      programmatic.current = false
    }
    setDemoEvents((prev) => [
      ...prev,
      { phase: 'undone', label: 'Restored the pre-demonstration circuit.' },
    ])
    demoObserve.current = null
    window.setTimeout(() => runRef.current(), 60)
  }

  /** Record the fresh solver reading after a demonstration applies. */
  useEffect(() => {
    const pending = demoObserve.current
    if (pending === null || runState.phase !== 'done') {
      return
    }
    demoObserve.current = null
    const reading = describeReading(pending.demo)
    setDemoEvents((prev) => [...prev, { phase: 'observed', label: `Solver observed ${reading}` }])
    if (pending.show) {
      document
        .querySelector('[aria-label="Simulation result"]')
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
    }
    // Reads the committed run only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runState])

  /** Latest undo for the demo timer; a manual undo clears it by emptying state. */
  const undoRef = useRef(handleDemoUndo)
  useEffect(() => {
    undoRef.current = handleDemoUndo
  })

  /** Guided demo: restore the pre-demonstration circuit once the observed
   * reading has landed, so the ladder can finish on the original story. */
  useEffect(() => {
    if (!demoAutoUndo || demoUndo === null) {
      return
    }
    const last = demoEvents[demoEvents.length - 1]
    if (last === undefined || last.phase !== 'observed') {
      return
    }
    const hurried = demoSignal !== demoSignalRef.current
    demoSignalRef.current = demoSignal
    const timer = window.setTimeout(() => {
      undoRef.current()
    }, hurried ? 60 : DEMO_UNDO_BEAT_MS)
    return () => window.clearTimeout(timer)
    // undoRef mirrors the latest undo; the trace drives re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoAutoUndo, demoUndo, demoEvents, demoSignal])

  const tools = [
    { id: 'battery', label: 'Battery', Icon: Zap },
    { id: 'bulb', label: 'Bulb', Icon: Lightbulb },
    { id: 'switch', label: 'Switch', Icon: ToggleLeft },
    { id: 'delete', label: 'Delete', Icon: Eraser },
  ] as const

  // Experiment pane (canvas + controls + live result banner) and insight pane
  // (prediction recap + readings + verdicts + next action): side by side on
  // wide lab stages, stacked in the narrow lens replica. Plain element
  // variables, not components, so React Flow keeps its state across renders.
  const experimentPane = (
    <>
      <div className="border-glass-border relative h-105 overflow-hidden rounded-2xl border">
        <SwitchToggleContext.Provider value={toggleSwitch}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const kind = event.dataTransfer.getData('application/verityn-component')
              if (kind === 'battery' || kind === 'bulb' || kind === 'switch') {
                placeToolAt(kind, event.clientX, event.clientY)
              }
            }}
            onPaneClick={(event) => {
              placeAt(event.clientX, event.clientY)
              onPeerSelect?.(null)
            }}
            onNodeClick={(_event, node) => {
              if (tool === 'delete') {
                removeNode(node.id)
              } else {
                onPeerSelect?.(node.id)
              }
            }}
            onEdgeClick={(_event, edge) => {
              if (tool === 'delete') {
                noteManualEdit()
                setEdges((current) => current.filter((entry) => entry.id !== edge.id))
                invalidate()
              } else {
                onPeerSelect?.(edge.id)
              }
            }}
            isValidConnection={isValidWire}
            nodeTypes={circuitNodeTypes}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: 'smoothstep', style: FLOW_EDGE_STYLE }}
            snapToGrid
            snapGrid={[20, 20]}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.25 }}
            colorMode="dark"
            aria-label="Circuit canvas"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
          </ReactFlow>
        </SwitchToggleContext.Provider>
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-ink-muted text-sm">Place a battery to begin</p>
          </div>
        )}
      </div>
      {simulateLocked !== null && (
        <p className="text-ink-muted text-sm" role="note">
          {simulateLocked}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={runState.phase === 'loading' || simulateLocked !== null}
          onClick={run}
          title={simulateLocked ?? undefined}
          className="bg-flow text-on-accent flex min-h-[44px] min-w-40 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {runState.phase === 'loading' ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Simulating…
            </>
          ) : mode === 'experiment' ? (
            'Run experiment'
          ) : loopClosed ? (
            'Test again'
          ) : (
            'Test circuit'
          )}
        </button>
        <button
          type="button"
          onClick={clear}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          {mode === 'experiment' ? 'Reset' : 'Clear'}
        </button>
        {demoUndo !== null && (
          <button
            type="button"
            onClick={handleDemoUndo}
            title="Restores the pre-demonstration circuit and re-runs the solver."
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Undo demonstration
          </button>
        )}
      </div>
      {simulateLocked !== null && (
        <p className="text-ink-muted text-sm" role="note">
          {simulateLocked}
        </p>
      )}
      {runState.phase === 'idle' && (
        <div className={`flow-status ${loopClosed ? 'flow-status-ready' : ''}`} role="status">
          <span className="flow-status-dot" aria-hidden="true" />
          <span>
            {nodes.length === 0
              ? 'Drag a battery into the workspace to begin.'
              : mode === 'experiment'
                ? ranOnceRef.current
                  ? 'Circuit changed — run the experiment again.'
                  : 'Ready to test your circuit.'
                : loopClosed
                  ? 'Loop closed — checking your circuit…'
                  : 'Connect the open terminal dots to complete the loop.'}
          </span>
        </div>
      )}
      {runState.phase === 'done' && runState.result.ok && (
        <div className="evidence-reveal">
          <ResultBanner result={runState.result} netlist={runState.netlist} />
        </div>
      )}
    </>
  )
  const insightPane = (
    <>
      {prediction && challenge && (
        <PredictionSummary prediction={prediction} hint={challenge.fix.hint} />
      )}
      {runState.phase === 'done' && <SimulationResultView result={runState.result} />}
      {choice && claim && runState.phase === 'done' && runState.result.ok && (
        <div className="evidence-reveal flex flex-col gap-4">
          <ClaimVerdict
            state={verdictState}
            choice={choice}
            session={coachSession ?? null}
            observed={runState.result.components[claim.component]}
            onRetry={run}
            onCoached={handleCoached}
            onCoachInteract={onCoachInteract}
            coachEnabled={!solo}
            demonstration={demonstration}
            onDemonstrate={handleDemonstrate}
            onActions={setServerActions}
            autoDemonstrate={autoDemonstrate}
            autoAsk={autoAsk}
            demoSignal={demoSignal}
            demoAppliedBefore={demoEvents.some((event) => event.phase === 'applied')}
            renderDone={
              solo && seed !== undefined
                ? () => (
                    <SoloResult
                      choice={choice}
                      claimComponent={claim.component}
                      seed={seed}
                      built={edges.map((edge) => ({
                        source: edge.source,
                        sourceTerminal: edge.sourceHandle ?? '',
                        target: edge.target,
                        targetTerminal: edge.targetHandle ?? '',
                      }))}
                      result={runState.result}
                      netlist={runState.netlist}
                      verdict={
                        verdictState.phase === 'done'
                          ? verdictState.verdict.status
                          : 'UNASSESSABLE'
                      }
                    />
                  )
                : undefined
            }
            ladderMemory={ladderMemory}
            onLadderChange={handleLadderChange}
          />
        </div>
      )}
      {choice === undefined && runState.phase === 'done' && prediction && challenge && (
        <div className="evidence-reveal">
          <StartVerdict prediction={prediction} challenge={challenge} result={runState.result} />
        </div>
      )}
      {runState.phase === 'error' && (
        <div className="glass-panel flex items-center gap-3 p-4" role="alert">
          <CircleX className="text-bad h-6 w-6 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base">{runState.message}</p>
          <button
            type="button"
            onClick={run}
            className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}
      {gate}
    </>
  )

  return (
    <section aria-labelledby="canvas-heading" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-flow mb-1 text-xs font-semibold uppercase tracking-[0.18em]">{eyebrow}</p>
          <h2 id="canvas-heading" className="text-xl font-semibold">
            {title}
          </h2>
        </div>
        <span className="border-glass-border text-ink-muted rounded-full border px-3 py-1 text-xs">
          {nodes.length === 0 ? 'Start with a battery' : loopClosed ? 'Ready to test' : 'Keep building'}
        </span>
      </div>
      <div className="flex gap-2" role="group" aria-label="Palette">
        {tools.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tool === id}
            onClick={() => toggleTool(id)}
            draggable={id !== 'delete'}
            onDragStart={(event) => {
              if (id !== 'delete') {
                handlePaletteDragStart(event, id)
              }
            }}
            className={`flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-[10px] border text-ink transition hover:-translate-y-0.5 hover:shadow-lg ${
              tool === id
                ? id === 'delete'
                  ? 'border-bad bg-glass-strong shadow-md'
                  : 'border-flow bg-glass-strong shadow-md'
                : 'border-glass-border bg-glass'
            }`}
          >
            {id === 'battery' ? (
              <svg className="palette-part palette-battery" viewBox="0 0 42 32" aria-hidden="true">
                <rect x="4" y="4" width="29" height="24" rx="5" />
                <path d="M33 10h5v12h-5M13 8v16M25 8v16M17 16h6M20 13v6" />
              </svg>
            ) : id === 'bulb' ? (
              <svg className="palette-part palette-bulb" viewBox="0 0 42 32" aria-hidden="true">
                <path d="M21 3c-7 0-12 5-12 11 0 5 3 8 6 10v3h12v-3c3-2 6-5 6-10 0-6-5-11-12-11Z" />
                <path d="M15 27h12M17 30h8M16 13l5 5 5-5" />
              </svg>
            ) : id === 'switch' ? (
              <svg className="palette-part" viewBox="0 0 42 32" aria-hidden="true">
                <path d="M4 24h6M32 24h6M10 24L28 8" />
                <circle cx="10" cy="24" r="2.5" />
                <circle cx="32" cy="24" r="2.5" />
              </svg>
            ) : (
              <Icon className="h-5 w-5" aria-hidden="true" />
            )}
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>
      <p className="text-ink-muted text-sm">
        {nodes.length === 0 && mode !== 'experiment' ? DEFAULT_INSTRUCTIONS : instructions}
      </p>
      {demoBuild !== null &&
        demoBuild.connections.some(
          (connection) =>
            !edges.some(
              (edge) =>
                edge.source === connection.source &&
                edge.sourceHandle === connection.sourceTerminal &&
                edge.target === connection.target &&
                edge.targetHandle === connection.targetTerminal,
            ),
        ) && (
          <div className="glass-panel p-3" aria-live="polite">
            <p className="text-sm font-medium">Demo: repairing the open connection</p>
            <p className="text-ink-muted text-sm">
              {demoBuild.connections
                .map(
                  (connection) =>
                    `${connection.source}.${connection.sourceTerminal} → ${connection.target}.${connection.targetTerminal}`,
                )
                .join(', ')}
            </p>
          </div>
        )}
      {layout === 'split' ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex min-w-0 flex-col gap-4">{experimentPane}</div>
          <div className="flex min-w-0 flex-col gap-4">{insightPane}</div>
        </div>
      ) : (
        <>
          {experimentPane}
          {insightPane}
        </>
      )}
      {runState.phase === 'done' && prediction && challenge && (
        <div className="evidence-reveal">
          <EvidenceTrace
            input={{
              prediction,
              question: challenge.question,
              netlist: runState.netlist,
              result: runState.result,
              verdict:
                verdictState.phase === 'done'
                  ? { status: verdictState.verdict.status, evidence: verdictState.verdict.evidence }
                  : null,
              expectedLit: choice === undefined ? challenge.expectedStart.lit : null,
              coach: solo
                ? { phase: 'unavailable', message: SOLO_COACH_MESSAGE }
                : coachOutcome,
              coachAvailable: choice !== undefined || solo,
            }}
          />
        </div>
      )}
    </section>
  )
}

/** Circuit canvas with provider for pane-click placement. */
export default function CircuitCanvas({
  seed,
  eyebrow,
  instructions,
  choice,
  claim,
  coachSession,
  onSolved,
  onDirty,
  onVerdict,
  onCoachDone,
  onCoachInteract,
  onEvidence,
  prediction,
  challenge,
  solo,
  layout,
  mode,
  runRequest,
  title,
  importRequest,
  gate,
  simulateLocked,
  peerSelection,
  onPeerSelect,
  autoDemonstrate,
  autoAsk,
  demoSignal,
  demoBuild,
  demoPaused,
  demoAutoUndo,
  onDemoTakeover,
}: {
  seed?: LessonSeed
  eyebrow?: string
  instructions?: string
  choice?: Choice
  claim?: { type: string; component: string }
  coachSession?: string | null
  onSolved?: (result: SimulateResult, netlist: Netlist) => void
  onDirty?: () => void
  onVerdict?: (status: VerdictStatus) => void
  onCoachDone?: (outcome?: CoachTraceOutcome) => void
  onCoachInteract?: () => void
  onEvidence?: (chapterId: string, input: TraceInput) => void
  prediction?: Prediction | null
  challenge?: Challenge
  solo?: boolean
  layout?: 'split' | 'stacked'
  mode?: 'lesson' | 'experiment'
  runRequest?: number
  title?: string
  importRequest?: CanvasImportRequest | null
  gate?: ReactNode
  simulateLocked?: string | null
  peerSelection?: string | null
  onPeerSelect?: (id: string | null) => void
  autoDemonstrate?: boolean
  autoAsk?: boolean
  demoSignal?: number
  demoBuild?: CanvasDemoBuild | null
  demoPaused?: boolean
  demoAutoUndo?: boolean
  onDemoTakeover?: () => void
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner
        seed={seed}
        eyebrow={eyebrow}
        instructions={instructions}
        choice={choice}
        claim={claim}
        coachSession={coachSession}
        onSolved={onSolved}
        onDirty={onDirty}
        onVerdict={onVerdict}
        onCoachDone={onCoachDone}
        onCoachInteract={onCoachInteract}
        onEvidence={onEvidence}
        prediction={prediction}
        challenge={challenge}
        solo={solo}
        layout={layout}
        mode={mode}
        runRequest={runRequest}
        title={title}
        importRequest={importRequest}
        gate={gate}
        simulateLocked={simulateLocked}
        peerSelection={peerSelection}
        onPeerSelect={onPeerSelect}
        autoDemonstrate={autoDemonstrate}
        autoAsk={autoAsk}
        demoSignal={demoSignal}
        demoBuild={demoBuild}
        demoPaused={demoPaused}
        demoAutoUndo={demoAutoUndo}
        onDemoTakeover={onDemoTakeover}
      />
    </ReactFlowProvider>
  )
}
