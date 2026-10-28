import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
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
import type { CanvasImportRequest } from '../canvas/layout'
import { counterStarts } from '../canvas/layout'
import { flowForCurrent, glowIntensity } from '../canvas/visuals'
import type { Challenge, Choice, Prediction } from '../lessons/lesson'
import { LIT_POWER_W, choiceToClaim, compareWithExpected } from '../lessons/lesson'
import type { CoachTraceOutcome, TraceInput } from '../lessons/trace'
import { SOLO_COACH_MESSAGE } from '../lessons/trace'
import { VerdictIcon } from './verdict'
import { VERDICT_LABELS } from './verdictLabels'
import EvidenceTrace from './EvidenceTrace'
import ReadoutValue from './ReadoutValue'
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

type CoachState =
  | { phase: 'idle' }
  | { phase: 'asking' }
  | { phase: 'done'; text: string; provider: string; ms: number }
  | { phase: 'refused'; message: string }
  | { phase: 'error'; message: string }

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
      },
    }))
}

function seedEdges(seed: LessonSeed | undefined): Edge[] {
  if (!seed) {
    return []
  }
  return seed.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceTerminal,
    target: edge.target,
    targetHandle: edge.targetTerminal,
    style: FLOW_EDGE_STYLE,
  }))
}

function CoachAsk({
  session,
  netlist,
  onResult,
  onInteract,
}: {
  session: string | null
  netlist: Netlist
  onResult?: (outcome: CoachTraceOutcome) => void
  /** Fired when the learner starts reflecting, so demo mode holds. */
  onInteract?: () => void
}) {
  const [coachState, setCoachState] = useState<CoachState>({ phase: 'idle' })
  const [reply, setReply] = useState('')
  const [savedReply, setSavedReply] = useState<string | null>(null)
  const coachController = useRef<AbortController | null>(null)

  useEffect(() => () => coachController.current?.abort(), [])

  const ask = () => {
    if (session === null) {
      const message = 'The prediction was not recorded, so no coaching was served.'
      setCoachState({ phase: 'error', message })
      onResult?.({ phase: 'unavailable', message })
      return
    }
    coachController.current?.abort()
    const next = new AbortController()
    coachController.current = next
    setCoachState({ phase: 'asking' })
    const started = performance.now()
    void (async () => {
      try {
        const answer = await askCoach(session, netlist, next.signal)
        if (next.signal.aborted) {
          return
        }
        if (answer.eligible) {
          const ms = performance.now() - started
          setCoachState({ phase: 'done', text: answer.text, provider: answer.provider, ms })
          onResult?.({ phase: 'done', text: answer.text, provider: answer.provider })
        } else {
          setCoachState({ phase: 'refused', message: answer.message })
          onResult?.({ phase: 'unavailable', message: answer.message })
        }
      } catch (err) {
        if (next.signal.aborted) {
          return
        }
        const message = err instanceof ApiError ? err.message : 'Request failed.'
        setCoachState({ phase: 'error', message })
        onResult?.({ phase: 'unavailable', message })
      }
    })()
  }

  if (coachState.phase === 'done') {
    const caption =
      coachState.provider === 'prototype-fake'
        ? 'Deterministic prototype — no model call.'
        : coachState.provider === 'meta-spark'
          ? 'Live Meta Muse response.'
          : null
    const saveReply = () => {
      const thought = reply.trim()
      if (thought === '') {
        return
      }
      setSavedReply(thought)
      onResult?.({
        phase: 'done',
        text: coachState.text,
        provider: coachState.provider,
        learnerReply: thought,
      })
    }
    return (
      <div className="glass-panel flex flex-col gap-2 p-4" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="border-glass-border w-fit rounded-full border px-3 py-1 text-xs font-medium text-ink">
            {providerBadge(coachState.provider)}
          </span>
          <span className="text-ink-muted text-xs">
            answered in {formatLatency(coachState.ms)}
          </span>
        </div>
        <p className="text-base">{coachState.text}</p>
        {caption !== null && <p className="text-ink-muted text-xs">{caption}</p>}
        {savedReply === null ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              saveReply()
            }}
          >
            <label htmlFor="coach-reply" className="text-sm font-medium">
              Complete the thought: <span className="text-ink-muted font-normal">An open switch…</span>
            </label>
            <div className="flex gap-2">
              <input
                id="coach-reply"
                type="text"
                value={reply}
                maxLength={140}
                autoComplete="off"
                placeholder="One line is enough"
                onFocus={() => onInteract?.()}
                onChange={(event) => {
                  onInteract?.()
                  setReply(event.target.value)
                }}
                className="border-glass-border min-h-[44px] w-full rounded-[10px] border px-3 text-base"
              />
              <button
                type="submit"
                disabled={reply.trim() === ''}
                className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <p className="text-ink-muted text-sm">
            <span className="font-medium text-ink">Your thought:</span> {savedReply}
          </p>
        )}
      </div>
    )
  }
  if (coachState.phase === 'asking') {
    return (
      <div className="glass-panel flex items-center gap-3 p-4" aria-live="polite">
        <LoaderCircle className="text-flow h-5 w-5 animate-spin" aria-hidden="true" />
        <p className="text-ink-muted text-sm">Asking the coach…</p>
      </div>
    )
  }
  if (coachState.phase === 'refused') {
    return (
      <div className="glass-panel p-4" aria-live="polite">
        <p className="text-ink-muted text-sm">{coachState.message}</p>
      </div>
    )
  }
  // Genuine provider failure with no usable fallback response: labeled
  // honestly, never disguised as coaching. Retryable via Try again.
  if (coachState.phase === 'error') {
    return (
      <div className="glass-panel flex flex-col gap-2 p-4" role="alert">
        <p className="text-base font-medium text-ink">Coach unavailable</p>
        <p className="text-ink-muted text-sm">{coachState.message}</p>
        <div>
          <button
            type="button"
            onClick={ask}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={ask}
        className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
      >
        Ask the coach
      </button>
    </div>
  )
}

/** Prediction-vs-observed card for the lesson's starting circuit.
 *
 * Used where the evaluator correctly refuses to judge (the broken
 * start, e.g. L1): the comparison runs against the pack's
 * solver-verified expected outcome. No measurements are shown because
 * a rejected circuit produces none — inventing amps or watts here
 * would fabricate evidence. */
function StartVerdict({
  prediction,
  challenge,
}: {
  prediction: Prediction
  challenge: Challenge
}) {
  const status = compareWithExpected(prediction.choice, challenge.expectedStart.lit)
  const component = challenge.claim.component
  const predictionText =
    prediction.choice === 'not_sure'
      ? 'Not sure — no definite prediction'
      : prediction.choice === 'yes'
        ? `${component} lights`
        : `${component} stays dark`
  const observedText = challenge.expectedStart.lit
    ? `${component} lights`
    : `${component} stays dark`
  return (
    <div className="glass-panel flex flex-col gap-1 p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <VerdictIcon status={status} />
        <div>
          <p className="text-base font-medium text-ink">{VERDICT_LABELS[status]}</p>
          <p className="text-ink-muted text-sm">
            <span className="font-medium text-ink">Your prediction:</span> {predictionText}
          </p>
          <p className="text-ink-muted text-sm">
            <span className="font-medium text-ink">Observed:</span> {observedText}
          </p>
        </div>
      </div>
      <p className="text-ink-muted pl-9 text-xs">
        Compared with the verified outcome of the starting circuit.
      </p>
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
}) {
  if (state.phase === 'idle') {
    return (
      <div className="glass-panel p-4" aria-live="polite">
        <p className="text-ink-muted text-sm">
          {choice === 'not_sure'
            ? 'You chose Not sure, so there is no definite prediction to check.'
            : 'This prediction cannot be checked yet.'}
        </p>
      </div>
    )
  }
  if (state.phase === 'checking') {
    return (
      <div className="glass-panel flex items-center gap-3 p-4" aria-live="polite">
        <LoaderCircle className="text-flow h-5 w-5 animate-spin" aria-hidden="true" />
        <p className="text-ink-muted text-sm">Checking your prediction against the model…</p>
      </div>
    )
  }
  if (state.phase === 'done') {
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
    return (
      <>
        <div className="glass-panel flex flex-col gap-1 p-4" aria-live="polite">
          <div className="flex items-center gap-3">
            <VerdictIcon status={state.verdict.status} />
            <div>
              <p className="text-base font-medium text-ink">
                {VERDICT_LABELS[state.verdict.status]}
              </p>
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
        {coachEnabled && state.verdict.status === 'CONTRADICTED' && (
          <CoachAsk
            session={session}
            netlist={state.netlist}
            onResult={onCoached}
            onInteract={onCoachInteract}
          />
        )}
      </>
    )
  }
  return (
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
  )
}

const DEFAULT_INSTRUCTIONS =
  'Place a battery and bulb, then connect every glowing terminal dot. We will test the circuit as soon as the loop closes.'

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
  importRequest,
}: {
  seed?: LessonSeed
  eyebrow?: string
  instructions?: string
  choice?: Choice
  claim?: { type: string; component: string }
  coachSession?: string | null
  onSolved?: (result: SimulateResult) => void
  /** Fired whenever the canvas edits invalidate the last result. */
  onDirty?: () => void
  /** Fired when the server verdict for the recorded prediction arrives. */
  onVerdict?: (status: VerdictStatus) => void
  /** Fired when the coach answers (twist only; never in solo). */
  onCoachDone?: () => void
  /** Fired when the learner starts a coach reflection. */
  onCoachInteract?: () => void
  /** Fired with the evidence-trace input for journey recaps. */
  onEvidence?: (chapterId: string, input: TraceInput) => void
  prediction?: Prediction | null
  challenge?: Challenge
  solo?: boolean
  importRequest?: CanvasImportRequest | null
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
  const [verdictState, setVerdictState] = useState<VerdictState>({ phase: 'idle' })
  const [coachOutcome, setCoachOutcome] = useState<CoachTraceOutcome | null>(null)
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
  useEffect(() => {
    onDirtyRef.current = onDirty
    onVerdictRef.current = onVerdict
    onCoachDoneRef.current = onCoachDone
    onEvidenceRef.current = onEvidence
  })

  useEffect(() => () => controller.current?.abort(), [])

  const invalidate = () => {
    controller.current?.abort()
    requestId.current += 1
    setRunState({ phase: 'idle' })
    setNodes((current) =>
      current.map((node) =>
        node.data.glow > 0 || node.data.invalid
          ? { ...node, data: { ...node.data, glow: 0, invalid: false, measurement: undefined } }
          : node.data.measurement
            ? { ...node, data: { ...node.data, measurement: undefined } }
          : node,
      ),
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
    setNodes((current) => current.filter((node) => node.id !== id))
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id))
    invalidate()
  }

  const onConnect = (connection: Connection) => {
    counters.current.wire += 1
    const id = `W${counters.current.wire}`
    setEdges((current) => addEdge({ ...connection, id, style: FLOW_EDGE_STYLE }, current))
    invalidate()
  }

  const clear = () => {
    setNodes([])
    setEdges([])
    uncertainRef.current = []
    invalidate()
  }

  const run = useCallback(() => {
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
        if (result.ok) {
          onSolved?.(result)
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
  }, [edges, nodes, onSolved, setEdges, setNodes, choice, claim])

  const loopClosed = isClosedLoop(nodes, edges)

  useEffect(() => {
    if (!loopClosed || runState.phase !== 'idle') {
      return
    }
    const timer = window.setTimeout(run, 450)
    return () => window.clearTimeout(timer)
  }, [loopClosed, runState.phase, nodes, edges, run])

  useEffect(() => {
    if (verdictState.phase === 'done') {
      onVerdictRef.current?.(verdictState.verdict.status)
    }
  }, [verdictState])

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
    })
  }, [runState, verdictState, coachOutcome, prediction, challenge, choice, solo])

  const handleCoached = (outcome: CoachTraceOutcome) => {
    setCoachOutcome(outcome)
    if (outcome.phase === 'done') {
      onCoachDoneRef.current?.()
    }
  }

  const toggleTool = (next: Exclude<Tool, null>) => {
    setTool((current) => (current === next ? null : next))
  }

  const tools = [
    { id: 'battery', label: 'Battery', Icon: Zap },
    { id: 'bulb', label: 'Bulb', Icon: Lightbulb },
    { id: 'switch', label: 'Switch', Icon: ToggleLeft },
    { id: 'delete', label: 'Delete', Icon: Eraser },
  ] as const

  return (
    <section aria-labelledby="canvas-heading" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-flow mb-1 text-xs font-semibold uppercase tracking-[0.18em]">{eyebrow}</p>
          <h2 id="canvas-heading" className="text-xl font-semibold">
            Build what you predicted
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
        {nodes.length === 0 ? DEFAULT_INSTRUCTIONS : instructions}
      </p>
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
            onPaneClick={(event) => placeAt(event.clientX, event.clientY)}
            onNodeClick={(_event, node) => {
              if (tool === 'delete') {
                removeNode(node.id)
              }
            }}
            onEdgeClick={(_event, edge) => {
              if (tool === 'delete') {
                setEdges((current) => current.filter((entry) => entry.id !== edge.id))
                invalidate()
              }
            }}
            isValidConnection={isValidWire}
            nodeTypes={circuitNodeTypes}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ style: FLOW_EDGE_STYLE }}
            snapToGrid
            snapGrid={[20, 20]}
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
      <div className="flex gap-2">
        <button
          type="button"
          disabled={runState.phase === 'loading'}
          onClick={run}
          className="bg-flow text-on-accent flex min-h-[44px] min-w-40 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {runState.phase === 'loading' ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Simulating…
            </>
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
          Clear
        </button>
      </div>
      {runState.phase === 'idle' && (
        <div className={`flow-status ${loopClosed ? 'flow-status-ready' : ''}`} role="status">
          <span className="flow-status-dot" aria-hidden="true" />
          <span>
            {nodes.length === 0
              ? 'Drag a battery into the workspace to begin.'
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
      {runState.phase === 'done' && <SimulationResultView result={runState.result} />}
      {choice && claim && runState.phase === 'done' && runState.result.ok && (
        <div key={verdictState.phase} className="evidence-reveal flex flex-col gap-4">
          <ClaimVerdict
            state={verdictState}
            choice={choice}
            session={coachSession ?? null}
            observed={runState.result.components[claim.component]}
            onRetry={run}
            onCoached={handleCoached}
            onCoachInteract={onCoachInteract}
            coachEnabled={!solo}
          />
        </div>
      )}
      {choice === undefined && runState.phase === 'done' && prediction && challenge && (
        <div className="evidence-reveal">
          <StartVerdict prediction={prediction} challenge={challenge} />
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
  importRequest,
}: {
  seed?: LessonSeed
  eyebrow?: string
  instructions?: string
  choice?: Choice
  claim?: { type: string; component: string }
  coachSession?: string | null
  onSolved?: (result: SimulateResult) => void
  onDirty?: () => void
  onVerdict?: (status: VerdictStatus) => void
  onCoachDone?: () => void
  onCoachInteract?: () => void
  onEvidence?: (chapterId: string, input: TraceInput) => void
  prediction?: Prediction | null
  challenge?: Challenge
  solo?: boolean
  importRequest?: CanvasImportRequest | null
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
        importRequest={importRequest}
      />
    </ReactFlowProvider>
  )
}
