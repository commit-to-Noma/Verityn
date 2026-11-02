import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CircleCheckBig, CircleQuestionMark, CircleX, ImagePlus, LoaderCircle } from 'lucide-react'
import type { SimulateResult, VisionProposeResult } from '../api/client'
import { ApiError, proposeCircuit, visionProviderBadge } from '../api/client'
import type { ImageGeometry } from '../canvas/layout'
import { layoutProposalFromGeometry } from '../canvas/layout'
import { glowIntensity } from '../canvas/visuals'
import { LIT_POWER_W, type LessonSeed } from '../lessons/lesson'
import type { LensSample } from '../lens/samples'
import { LENS_SAMPLES, sampleLevel } from '../lens/samples'
import { showTriptych } from '../lens/triptych'
import {
  DEFAULT_LENS_VIEW,
  LENS_VIEW_MODES,
  REVIEW_STATUS_LABELS,
  ambiguousWireNote,
  canLoadProposal,
  canTestProposal,
  componentReviewStatus,
  connectionReviewStatus,
  nextRevealStep,
  polarityText,
  regionStyle,
  reviewBanner,
  reviewSummary,
  wirePathPoints,
  wireTraceSummary,
  type LensViewMode,
  type RevealStep,
} from '../vision/review'
import { useProofMode } from '../proof/store'
import { LENS_ACCEPT, firstLensFile, validateLensFile } from '../vision/upload'
import { LENS_STEP_LABELS, lensSteps } from '../vision/steps'
import CircuitCanvas from './CircuitCanvas'
import HealthStatus from './HealthStatus'
import ProofChips from './ProofChips'
import ReadoutValue from './ReadoutValue'
import RealityTriptych from './RealityTriptych'
import SketchPad from './SketchPad'

/** Lens overlay splits out: only loaded when a sample opens. */
const RealityLens = lazy(() => import('./RealityLens'))

type LabState =
  | { phase: 'idle' }
  | { phase: 'selected'; image: string; name: string; size: ImageGeometry }
  | { phase: 'working'; image: string; size: ImageGeometry }
  | { phase: 'proposed'; image: string; size: ImageGeometry; result: VisionProposeResult; nonce: number }
  | { phase: 'error'; message: string; image: string | null; size: ImageGeometry | null; reason: 'file' | 'vision' }

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const REVEAL_BEAT_MS = 350

/** Each pipeline stage drawn literally: drop zone, photo with detections, loop with readout. */
function StageArt({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="border-glass-border flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed">
        <ImagePlus className="text-ink-muted h-6 w-6" aria-hidden="true" />
        <span className="text-ink-muted font-mono text-[10px]">photo or sketch</span>
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className="relative h-16 overflow-hidden rounded-xl bg-black/40" aria-hidden="true">
        <div className="absolute inset-2 rounded-lg bg-gradient-to-br from-white/10 to-transparent" />
        <div className="border-flow absolute left-3 top-2.5 rounded-[3px] border-2 border-dashed px-1 font-mono text-[9px] leading-4">
          battery?
        </div>
        <div className="border-flow absolute bottom-2.5 right-3 rounded-[3px] border-2 border-dashed px-1 font-mono text-[9px] leading-4">
          bulb?
        </div>
        <svg viewBox="0 0 100 64" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <polyline
            points="8,50 35,50 35,14 92,14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 3"
            className="text-flow"
          />
        </svg>
      </div>
    )
  }
  return (
    <div className="flex h-16 items-center justify-center gap-2 rounded-xl bg-black/40" aria-hidden="true">
      <svg viewBox="0 0 64 40" className="h-10 w-16">
        <rect x="4" y="6" width="14" height="28" rx="2" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-muted" />
        <line x1="4" y1="20" x2="18" y2="20" stroke="currentColor" strokeWidth="2" className="text-ink-muted" />
        <polyline
          points="18,34 46,34 46,20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-flow"
        />
        <polyline
          points="18,6 46,6 46,14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-flow"
        />
        <circle cx="46" cy="17" r="6" fill="var(--color-glow-light)" opacity="0.9" />
      </svg>
      <span className="text-flow font-mono text-xs">0.6 A</span>
    </div>
  )
}

/** Two-panel review: source diagram beside the editable replica. */
function ReviewPanels({
  image,
  size,
  result,
  nonce,
  confirmed,
  testedResult,
  onConfirm,
  onTested,
  onReset,
  onTryExperiment,
}: {
  image: string
  size: ImageGeometry
  result: VisionProposeResult
  nonce: number
  confirmed: boolean
  testedResult: SimulateResult | null
  onConfirm: () => void
  onTested: (result: SimulateResult) => void
  onReset: () => void
  onTryExperiment?: (seed: LessonSeed, label: string) => void
}) {
  const proposal = result.proposal
  const trace = useProofMode()
  const [view, setView] = useState<LensViewMode>(DEFAULT_LENS_VIEW)
  const [selection, setSelection] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [corrected, setCorrected] = useState(false)
  const [reveal, setReveal] = useState<RevealStep>(() => (reducedMotion() ? 'review' : 'image'))
  const [compareSplit, setCompareSplit] = useState(50)
  const replicaRef = useRef<HTMLDivElement | null>(null)

  const loadable = canLoadProposal(proposal)
  const canTest = canTestProposal(proposal, confirmed)
  const banner = reviewBanner(
    proposal.status,
    proposal.connections.filter((connection) => connection.uncertain).length,
    proposal.connections.length,
  )

  /** Geometry-mapped seed with per-part review badges; built once per proposal. */
  const seed: LessonSeed = useMemo(() => {
    const { seed: mapped } = layoutProposalFromGeometry(proposal, size)
    return {
      ...mapped,
      nodes: mapped.nodes.map((node) => {
        const status = componentReviewStatus(node.id, proposal, false)
        return {
          ...node,
          review:
            status === 'verified' || status === 'learner-corrected' ? status : ('needs-review' as const),
        }
      }),
    }
    // Proposal identity is stable for the review lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uncertainIds = useMemo(
    () =>
      proposal.connections
        .map((connection, index) => (connection.uncertain ? `V${index + 1}` : null))
        .filter((id): id is string => id !== null),
    [proposal],
  )

  useEffect(() => {
    if (reveal === 'review') {
      return
    }
    const timer = window.setTimeout(() => {
      setReveal((step) => nextRevealStep(step, false))
    }, REVEAL_BEAT_MS)
    return () => window.clearTimeout(timer)
  }, [reveal])

  const interrupt = () => setReveal((step) => nextRevealStep(step, true))

  const showOriginal = view === 'compare' || view === 'original' || view === 'detected'
  const showModel = loadable && (view === 'compare' || view === 'model')
  const showOverlays = view !== 'original' && reveal !== 'image'
  const tracedWires = proposal.connections
    .map((connection, index) => ({
      id: `V${index + 1}`,
      region: connection.evidence.region_id,
      path: connection.evidence.path,
    }))
    .filter((wire): wire is { id: string; region: string; path: [number, number][] } => wire.path !== null)

  const editModel = () => {
    setView('compare')
    const firstFlagged =
      proposal.components.find(
        (component) => componentReviewStatus(component.id, proposal, false) === 'needs-review',
      )?.id ??
      (proposal.connections.findIndex((connection) => connection.uncertain) >= 0
        ? `V${proposal.connections.findIndex((connection) => connection.uncertain) + 1}`
        : null)
    setSelection(firstFlagged ?? proposal.components[0]?.id ?? null)
    replicaRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
  }

  const toggleSelection = (id: string) => {
    interrupt()
    setSelection((current) => (current === id ? null : id))
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Review view">
        {LENS_VIEW_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            aria-pressed={view === mode.id}
            onClick={() => {
              interrupt()
              setView(mode.id)
            }}
            className={`min-h-[44px] rounded-[10px] border px-4 text-sm font-medium ${
              view === mode.id ? 'border-flow/60 text-ink' : 'border-glass-border text-ink-muted'
            }`}
          >
            {mode.label}
          </button>
        ))}
        <span className="border-glass-border ml-auto w-fit rounded-full border px-3 py-1 text-xs font-medium text-ink">
          {visionProviderBadge(result.provider)}
        </span>
      </div>
      {result.provider === 'meta-spark' && (
        <p className="text-ink-muted text-xs">
          Proposal by Meta Muse Spark · Verityn Solver measures only after you confirm.
        </p>
      )}
      <div
        className="flex items-start gap-2"
        role={banner.tone === 'blocked' ? 'alert' : 'note'}
      >
        {banner.tone === 'ok' && (
          <CircleCheckBig className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
        )}
        {banner.tone === 'warn' && (
          <CircleQuestionMark className="mt-0.5 h-5 w-5 shrink-0 text-flow" aria-hidden="true" />
        )}
        {banner.tone === 'blocked' && (
          <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm font-medium">{reviewSummary(proposal)}</p>
          <p className="text-ink-muted text-sm">{banner.text}</p>
          {banner.hint !== undefined && <p className="text-ink-muted text-sm">{banner.hint}</p>}
          <div className="mt-2">
            <ProofChips stages={['lens']} />
          </div>
        </div>
      </div>
      {reveal !== 'review' && (
        <button
          type="button"
          onClick={interrupt}
          className="border-glass-border w-fit min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Skip to review
        </button>
      )}
      {view === 'compare' && showOriginal && showModel && (
        <label className="text-ink-muted hidden items-center gap-3 text-xs xl:flex">
          Adjust panel widths
          <input
            type="range"
            min={25}
            max={75}
            value={compareSplit}
            onChange={(event) => setCompareSplit(Number(event.target.value))}
            aria-label="Compare divider"
            className="accent-flow h-[44px] w-56"
          />
        </label>
      )}
      <div
        className={`grid gap-4 ${
          view === 'compare' && showOriginal && showModel
            ? 'xl:grid-cols-[minmax(0,var(--lens-a))_minmax(0,var(--lens-b))]'
            : 'xl:grid-cols-2'
        }`}
        style={
          {
            '--lens-a': `${compareSplit}fr`,
            '--lens-b': `${100 - compareSplit}fr`,
          } as CSSProperties
        }
        onPointerDown={interrupt}
      >
        {showOriginal && (
          <div className="glass-panel flex flex-col gap-3 p-4">
            <h4 className="text-base font-semibold">Original diagram</h4>
            <div className="relative self-start">
              <img src={image} alt="Uploaded schematic" className="max-h-80 rounded-[10px]" />
              {testedResult?.ok === true && (
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  {proposal.components
                    .filter((component) => component.type === 'bulb')
                    .map((component) => {
                      const reading = testedResult.components[component.id]
                      if (reading === undefined) {
                        return null
                      }
                      const bounds = component.evidence.bounds
                      return (
                        <div
                          key={component.id}
                          className="absolute rounded-full"
                          style={{
                            left: `${(bounds.x + bounds.width / 2) * 100}%`,
                            top: `${(bounds.y + bounds.height / 2) * 100}%`,
                            width: `${bounds.width * 240}%`,
                            aspectRatio: '1',
                            transform: 'translate(-50%, -50%)',
                            background:
                              'radial-gradient(circle, var(--color-glow-light) 0%, transparent 62%)',
                            filter: 'blur(8px)',
                            opacity: glowIntensity(reading.power),
                          }}
                        />
                      )
                    })}
                </div>
              )}
              {showOverlays && (
                <div className="absolute inset-0">
                  {tracedWires.length > 0 && (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-label="Traced wires"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    >
                      {tracedWires.map((wire) => {
                        const active = selection === wire.id || hover === wire.id
                        return (
                          <polyline
                            key={wire.region}
                            data-region={wire.region}
                            points={wirePathPoints(wire.path)}
                            fill="none"
                            stroke="var(--color-flow)"
                            strokeWidth={active ? 3.5 : 2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="5 3"
                            vectorEffect="non-scaling-stroke"
                            opacity={active ? 1 : 0.75}
                          />
                        )
                      })}
                    </svg>
                  )}
                  {proposal.components.map((component) => {
                    const status = componentReviewStatus(component.id, proposal, corrected)
                    const active = selection === component.id || hover === component.id
                    return (
                      <button
                        key={component.id}
                        type="button"
                        aria-pressed={selection === component.id}
                        aria-label={`${component.id} ${component.type}, ${REVIEW_STATUS_LABELS[status]}`}
                        title={`${component.id} · ${component.evidence.region_id}`}
                        onClick={() => toggleSelection(component.id)}
                        onMouseEnter={() => setHover(component.id)}
                        onMouseLeave={() => setHover((current) => (current === component.id ? null : current))}
                        onFocus={() => setHover(component.id)}
                        onBlur={() => setHover((current) => (current === component.id ? null : current))}
                        className={`absolute rounded-[4px] border-2 ${
                          active ? 'border-ok bg-ok/10' : 'border-flow'
                        }`}
                        style={regionStyle(component.evidence.bounds)}
                      >
                        <span className="bg-flow text-on-accent absolute -top-5 left-0 rounded px-1 font-mono text-[10px] font-medium whitespace-nowrap">
                          {component.id}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {testedResult?.ok === true && (
              <ul aria-label="Measured bulb readings on your photo" className="flex flex-wrap gap-2">
                {proposal.components
                  .filter((component) => component.type === 'bulb')
                  .map((component) => {
                    const reading = testedResult.components[component.id]
                    if (reading === undefined) {
                      return null
                    }
                    return (
                      <li
                        key={component.id}
                        className="border-glass-border rounded-full border px-3 py-1 text-xs"
                      >
                        <span className="font-mono font-medium">{component.id}</span>
                        {' · '}
                        {reading.power > LIT_POWER_W ? 'lit' : 'dark'}
                        {' · '}
                        <ReadoutValue value={reading.current} unit="A" />
                        {' · '}
                        <ReadoutValue value={reading.power} unit="W" />
                      </li>
                    )
                  })}
              </ul>
            )}
            <h5 className="text-sm font-semibold">Detected evidence</h5>
            <ul className="flex flex-col gap-1">
              {proposal.components.map((component) => {
                const status = componentReviewStatus(component.id, proposal, corrected)
                const active = selection === component.id || hover === component.id
                return (
                  <li key={component.id}>
                    <button
                      type="button"
                      aria-pressed={selection === component.id}
                      onClick={() => toggleSelection(component.id)}
                      onMouseEnter={() => setHover(component.id)}
                      onMouseLeave={() => setHover((current) => (current === component.id ? null : current))}
                      className={`flex w-full items-baseline gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm ${
                        active ? 'bg-flow/10' : ''
                      }`}
                    >
                      <span className="font-mono font-medium">{component.id}</span>
                      <span className="text-ink-muted capitalize">{component.type}</span>
                      {component.type === 'battery' &&
                        component.polarity !== undefined &&
                        component.polarity !== null && (
                          <span className="font-mono text-xs" title="Detected polarity">
                            {polarityText(component.polarity)}
                          </span>
                        )}
                      {component.type === 'battery' && component.polarity === null && (
                        <span className="text-ink-muted text-xs">polarity unknown</span>
                      )}
                      {component.type === 'switch' && (
                        <span className="text-ink-muted">
                          {component.closed === null
                            ? 'state unknown'
                            : component.closed
                              ? 'closed'
                              : 'open'}
                        </span>
                      )}
                      <span className="text-ink-muted text-xs">{REVIEW_STATUS_LABELS[status]}</span>
                      {trace && (
                        <span className="text-ink-muted ml-auto font-mono text-xs">
                          {component.evidence.region_id}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
              {proposal.connections.map((connection, index) => {
                const id = `V${index + 1}`
                const status = connectionReviewStatus(connection)
                const active = selection === id || hover === id
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-pressed={selection === id}
                      onClick={() => toggleSelection(id)}
                      onMouseEnter={() => setHover(id)}
                      onMouseLeave={() => setHover((current) => (current === id ? null : current))}
                      className={`flex w-full items-baseline gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm ${
                        active ? 'bg-flow/10' : ''
                      }`}
                    >
                      <span className="font-mono font-medium">{id}</span>
                      <span className="text-ink-muted">
                        {connection.from.node}.{connection.from.terminal} ↔ {connection.to.node}.
                        {connection.to.terminal}
                      </span>
                      <span className="text-ink-muted text-xs">{REVIEW_STATUS_LABELS[status]}</span>
                      {trace && (
                        <span className="text-ink-muted ml-auto font-mono text-xs">
                          {connection.evidence.region_id}
                        </span>
                      )}
                    </button>
                    {selection === id && status === 'connection-ambiguous' && (
                      <p className="text-ink-muted px-2 pb-1 text-xs">
                        {ambiguousWireNote(connection.evidence.path !== null)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="text-ink-muted text-xs">
              {wireTraceSummary(tracedWires.length, proposal.connections.length)}
            </p>
          </div>
        )}
        {showModel && (
          <div ref={replicaRef} className="glass-panel flex scroll-mt-4 flex-col gap-3 p-4">
            <h4 className="text-base font-semibold">Interactive circuit replica</h4>
            <p className="text-ink-muted text-xs">
              Positions mapped from the detected regions. Wire routes are reconstructed between
              the proposed terminals  -  not traced from the image.
            </p>
            {(reveal === 'replica' || reveal === 'review') && (
              <CircuitCanvas
                key={`review-${nonce}`}
                layout="stacked"
                proofStage="lens"
                eyebrow="Review"
                title="Check the replica"
                importRequest={{ seed, uncertainIds, nonce }}
                reportRejections
                simulateLocked={canTest ? null : 'Confirm the model below before testing it against the simulator.'}
                peerSelection={selection}
                onPeerSelect={setSelection}
                onDirty={() => setCorrected(true)}
                onSolved={(result) => onTested(result)}
              />
            )}
          </div>
        )}
      </div>
      {result.assumptions.map((assumption) => (
        <p key={assumption} className="text-ink-muted text-xs">
          Assumed: {assumption}
        </p>
      ))}
      <h4 className="text-base font-semibold">Review before testing</h4>
      {loadable && !confirmed && (
        <p className="text-sm">The model proposed this circuit. Review it before testing.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {loadable && !confirmed && (
          <button
            type="button"
            onClick={() => {
              interrupt()
              onConfirm()
            }}
            className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
          >
            Confirm model
          </button>
        )}
        {loadable && !confirmed && (
          <button
            type="button"
            onClick={editModel}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Edit model
          </button>
        )}
        {confirmed && (
          <p className="text-ink-muted text-sm" role="status">
            Model confirmed{corrected ? ' with your corrections' : ''}. Verityn Solver will test
            the circuit you approved.
          </p>
        )}
        <button
          type="button"
          onClick={onReset}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Try another image
        </button>
      </div>
      {showTriptych(confirmed, testedResult) && testedResult !== null && (
        <RealityTriptych
          image={image}
          seed={seed}
          result={testedResult}
          bulbIds={proposal.components
            .filter((component) => component.type === 'bulb')
            .map((component) => component.id)}
        />
      )}
      {showTriptych(confirmed, testedResult) &&
        testedResult?.ok === true &&
        onTryExperiment !== undefined && (
          <div className="flex flex-col gap-2">
            <p className="text-ink-muted text-sm">
              These numbers are a starting point — change one part at a time to see what moves them.
            </p>
            <button
              type="button"
              onClick={() => onTryExperiment(seed, 'Reality Lens import')}
              className="border-glass-border min-h-[44px] self-start rounded-[10px] border px-4 text-sm font-medium"
            >
              Test this in the Experiment Bay
            </button>
          </div>
        )}
    </div>
  )
}

export default function SnapBuildLab({
  onReturnToLab,
  onTryExperiment,
}: {
  onReturnToLab?: () => void
  onTryExperiment?: (seed: LessonSeed, label: string) => void
}) {
  const [lensSample, setLensSample] = useState<LensSample | null>(null)
  const [state, setState] = useState<LabState>({ phase: 'idle' })
  const [confirmed, setConfirmed] = useState(false)
  const [tested, setTested] = useState(false)
  const [lensResult, setLensResult] = useState<SimulateResult | null>(null)
  const [dragging, setDragging] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const reviewRef = useRef<HTMLDivElement | null>(null)
  const nonce = useRef(0)
  const [sketching, setSketching] = useState(false)
  const sketchTrial = new URLSearchParams(window.location.search).has('sketch')

  useEffect(() => () => controller.current?.abort(), [])

  /** A fresh proposal jumps past the gallery to the review. */
  useEffect(() => {
    if (state.phase === 'proposed') {
      reviewRef.current?.scrollIntoView({
        behavior: reducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      })
    }
  }, [state.phase])

  const pickFile = (file: File | undefined) => {
    if (!file) {
      return
    }
    const verdict = validateLensFile(file)
    if (!verdict.ok) {
      setState({ phase: 'error', message: verdict.message, image: null, size: null, reason: 'file' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setState({ phase: 'error', message: 'Could not read that file.', image: null, size: null, reason: 'file' })
        return
      }
      const dataUrl = reader.result
      const probe = new Image()
      probe.onload = () => {
        setState({
          phase: 'selected',
          image: dataUrl,
          name: file.name,
          size: { width: probe.naturalWidth, height: probe.naturalHeight },
        })
      }
      probe.onerror = () =>
        setState({ phase: 'error', message: 'Could not read that file.', image: null, size: null, reason: 'file' })
      probe.src = dataUrl
    }
    reader.onerror = () =>
      setState({ phase: 'error', message: 'Could not read that file.', image: null, size: null, reason: 'file' })
    reader.readAsDataURL(file)
  }

  const interpret = (image: string, size: ImageGeometry) => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setState({ phase: 'working', image, size })
    void (async () => {
      try {
        const result = await proposeCircuit(image, next.signal)
        if (next.signal.aborted) {
          return
        }
        nonce.current += 1
        setConfirmed(false)
        setTested(false)
        setLensResult(null)
        setState({ phase: 'proposed', image, size, result, nonce: nonce.current })
      } catch (err) {
        if (next.signal.aborted) {
          return
        }
        const code = err instanceof ApiError ? err.code : null
        const message = err instanceof ApiError ? err.message : 'Request failed.'
        const visionDown = code === 'PROVIDER_UNAVAILABLE' || code === 'MISSING_KEY'
        const nextStep = code === 'PROVIDER_TIMEOUT'
          ? 'Vision timed out. Try again or use a sample.'
          : code === 'RATE_LIMITED'
            ? 'Vision is rate limited. Try again shortly or use a sample.'
            : code === 'INVALID_PROPOSAL'
              ? 'The proposal was not usable. Review a sample or try another image.'
              : visionDown
                ? 'Meta vision is unavailable. Use a sample or return to the Guided Lab.'
                : message
        setState({
          phase: 'error',
          message: nextStep,
          image,
          size,
          reason: visionDown ? 'vision' : 'file',
        })
      }
    })()
  }

  const reset = () => {
    controller.current?.abort()
    setConfirmed(false)
    setTested(false)
    setLensResult(null)
    setState({ phase: 'idle' })
  }

  const steps = lensSteps(state.phase === 'proposed', confirmed, tested)

  const sampleCards = LENS_SAMPLES.map((sample) => (
    <button
      key={sample.id}
      type="button"
      onClick={() => setLensSample(sample)}
      className="glass-panel group relative flex min-w-56 flex-col overflow-hidden text-left sm:min-w-0"
    >
      <img
        src={sample.image}
        alt=""
        className="h-28 w-full object-cover"
      />
      <span className="absolute top-2 right-2 rounded-full border border-glass-border bg-black/60 px-2 py-0.5 text-[11px] font-medium text-ink backdrop-blur-sm">
        {sampleLevel(sample.id)}
      </span>
      <span className="flex flex-col gap-1 p-3">
        <span className="text-sm font-medium">{sample.title}</span>
        <span className="text-ink-muted text-xs">Open Reality Lens →</span>
      </span>
    </button>
  ))

  return (
    <section
      aria-label="Diagram upload and review"
      className="flex flex-col gap-4"
      onPaste={(event) => {
        const pasted = firstLensFile(event.clipboardData?.files)
        if (pasted !== undefined) {
          event.preventDefault()
          pickFile(pasted)
        }
      }}
    >
      <div>
        <p className="text-ink-muted mb-2 text-sm">
          From a photo to a measured circuit in three steps —{' '}
          <strong className="text-ink font-semibold">
            {steps.every((step) => step === 'done')
              ? 'all done.'
              : `you're on step ${(steps.findIndex((step) => step === 'current') + 1) || 1}.`}
          </strong>
        </p>
        <ol aria-label="Reality Lens progress" className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {LENS_STEP_LABELS.map((label, index) => {
            const stepState = steps[index] ?? 'todo'
            return (
              <Fragment key={label}>
                {index > 0 && (
                  <li aria-hidden="true" className="hidden w-4 shrink-0 list-none self-center sm:block">
                    <div className="bg-glass-border rounded-full py-px" />
                  </li>
                )}
                <li
                  aria-current={stepState === 'current' ? 'step' : undefined}
                  className={`min-w-0 flex-1 rounded-2xl border p-3 ${
                    stepState === 'done'
                      ? 'border-ok/50 opacity-80'
                      : stepState === 'current'
                        ? 'border-flow bg-flow/5 shadow-[0_0_24px_-6px_var(--color-flow)] ring-2 ring-flow/60'
                        : 'border-glass-border opacity-60'
                  }`}
                >
                  <StageArt index={index} />
                  <p className={`mt-2 flex items-center gap-2 text-xs ${stepState === 'current' ? 'font-semibold' : 'font-medium'}`}>
                    {stepState === 'current' && (
                      <span className="bg-flow rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                        Now
                      </span>
                    )}
                    <span aria-hidden="true" className="text-ink-muted">
                      {stepState === 'done' ? '✓' : `${index + 1}`}
                    </span>
                    {label}
                  </p>
                </li>
              </Fragment>
            )
          })}
        </ol>
      </div>
      <div className="flex flex-col gap-3">
        {sketchTrial && !sketching && state.phase === 'idle' && (
          <button
            type="button"
            onClick={() => setSketching(true)}
            className="border-glass-border min-h-[44px] self-start rounded-[10px] border px-4 text-sm font-medium"
          >
            Draw a sketch instead (trial)
          </button>
        )}
        {sketchTrial && sketching && state.phase === 'idle' && (
          <SketchPad
            onExport={(image, size) => {
              setSketching(false)
              setState({ phase: 'selected', image, name: 'sketch.png', size })
            }}
            onCancel={() => setSketching(false)}
          />
        )}
        {!(sketchTrial && sketching && state.phase === 'idle') && state.phase === 'idle' && (
        <div
          aria-label="Diagram drop zone"
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            pickFile(firstLensFile(event.dataTransfer?.files))
          }}
          className={`flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition focus-within:border-flow ${
            dragging ? 'border-flow bg-flow/10' : 'border-glass-border bg-glass/40'
          }`}
        >
          <ImagePlus className="text-flow h-10 w-10" aria-hidden="true" />
          <h3 className="text-flow text-xs font-semibold tracking-[0.18em]">Your diagram</h3>
          <p className="max-w-md text-2xl font-semibold tracking-tight">
            {dragging ? 'Drop it to begin' : 'Drop a circuit diagram to see it'}
          </p>
          <p className="text-ink-muted max-w-md text-sm">
            Or paste one from your clipboard. Meta Muse Spark Vision proposes what it sees; you
            confirm before Verityn Solver measures anything. PNG, JPEG, or WebP, up to 4 MB.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <label className="bg-flow text-on-accent inline-flex min-h-[44px] cursor-pointer items-center rounded-[10px] px-5 text-sm font-medium">
              Choose an image
              <input
                type="file"
                accept={LENS_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  pickFile(firstLensFile(event.target.files))
                  // Allow selecting the same file twice in a row.
                  event.target.value = ''
                }}
              />
            </label>
            <label className="border-glass-border hidden min-h-[44px] cursor-pointer items-center rounded-[10px] border px-4 text-sm font-medium [@media(pointer:coarse)]:inline-flex">
              Take a photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  pickFile(firstLensFile(event.target.files))
                  event.target.value = ''
                }}
              />
            </label>
          </div>
          <div className="mt-1 flex justify-center">
            <HealthStatus compact />
          </div>
        </div>
        )}
        {!(sketchTrial && sketching && state.phase === 'idle') && state.phase !== 'idle' && (
        <div
          aria-label="Diagram drop zone"
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            pickFile(firstLensFile(event.dataTransfer?.files))
          }}
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-dashed px-4 py-2.5 text-sm transition ${
            dragging ? 'border-flow bg-flow/10' : 'border-glass-border'
          }`}
        >
          <h3 className="text-ink-muted font-medium">Your diagram</h3>
          <span className="text-ink-muted" aria-hidden="true">·</span>
          <span className="text-ink-muted text-sm">
            {dragging ? 'Drop it to switch diagrams' : 'Drop a new file here, or'}
          </span>
          <label className="text-flow cursor-pointer text-sm font-medium underline underline-offset-2">
            choose a different image
            <input
              type="file"
              accept={LENS_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                pickFile(firstLensFile(event.target.files))
                event.target.value = ''
              }}
            />
          </label>
        </div>
        )}
      </div>
      {(state.phase === 'selected' || state.phase === 'working') && (
        <div className="glass-panel grid items-center gap-5 p-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:p-5">
          <img
            src={state.image}
            alt="Uploaded schematic"
            className="max-h-80 w-full rounded-[10px] bg-black/30 object-contain"
          />
          <div className="flex min-w-0 flex-col gap-4">
          {state.phase === 'selected' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => interpret(state.image, state.size)}
                className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
              >
                Interpret with Meta Spark
              </button>
              <button
                type="button"
                onClick={reset}
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
              >
                Remove
              </button>
              <div className="ml-auto">
                <HealthStatus compact />
              </div>
            </div>
          )}
          {state.phase === 'working' && (
            <div className="flex items-center gap-3" aria-live="polite">
              <LoaderCircle className="text-flow h-5 w-5 animate-spin" aria-hidden="true" />
              <p className="text-ink-muted text-sm">Reading the schematic…</p>
            </div>
          )}
          </div>
        </div>
      )}
      {state.phase === 'error' && (
        <div className="glass-panel flex flex-col gap-3 p-4" role="alert">
          {state.reason === 'vision' && (
            <span className="border-glass-border text-ink-muted w-fit rounded-full border px-3 py-1 text-xs font-medium">
              Meta vision unavailable
            </span>
          )}
          <p className="text-sm">{state.message}</p>
          <div className="flex flex-wrap items-center gap-3">
            {state.image !== null && state.size !== null && (
              <button
                type="button"
                onClick={() => {
                  const retry = state
                  if (retry.phase === 'error' && retry.image !== null && retry.size !== null) {
                    interpret(retry.image, retry.size)
                  }
                }}
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
              >
                Try again
              </button>
            )}
            {state.reason === 'vision' && (
              <button
                type="button"
                onClick={() =>
                  document.getElementById('lens-samples')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
              >
                Use a sample
              </button>
            )}
            {state.reason === 'vision' && onReturnToLab !== undefined && (
              <button
                type="button"
                onClick={onReturnToLab}
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
              >
                Return to Guided Lab
              </button>
            )}
            {state.reason === 'file' && (
              <button
                type="button"
                onClick={reset}
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
      {state.phase === 'proposed' && (
        <div ref={reviewRef} className="glass-panel flex scroll-mt-4 flex-col gap-3 p-4">
          <ReviewPanels
            key={`proposal-${state.nonce}`}
            image={state.image}
            size={state.size}
            result={state.result}
            nonce={state.nonce}
            confirmed={confirmed}
            testedResult={lensResult}
            onConfirm={() => setConfirmed(true)}
            onTested={(result) => {
              setTested(true)
              setLensResult(result)
            }}
            onReset={reset}
            onTryExperiment={onTryExperiment}
          />
        </div>
      )}
      {state.phase === 'proposed' && lensSample === null ? (
        <details id="lens-samples" className="glass-panel scroll-mt-4 px-4 py-2">
          <summary className="min-h-[44px] cursor-pointer content-center text-sm font-medium">
            Sample diagrams ({LENS_SAMPLES.length})
          </summary>
          <div className="mt-2 grid gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-4">
            {sampleCards}
          </div>
        </details>
      ) : (
      <div id="lens-samples" className="flex scroll-mt-4 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-flow text-xs font-semibold tracking-[0.18em]">Practice gallery</p>
            <h3 className="mt-1 text-base font-semibold">Sample diagrams</h3>
            <p className="text-ink-muted mt-1 text-sm">
              Rehearse the full loop on a curated circuit — predict, run, compare. No upload needed.
            </p>
          </div>
          <div
            className="text-ink-muted flex items-center gap-3 text-xs"
            aria-label={`${LENS_SAMPLES.length} samples across Starter and Challenge levels`}
          >
            <span aria-hidden="true">{LENS_SAMPLES.length} diagrams</span>
            <span className="flex items-center gap-1.5" aria-hidden="true">
              <span className="bg-ok h-1.5 w-1.5 rounded-full" /> Starter
            </span>
            <span className="flex items-center gap-1.5" aria-hidden="true">
              <span className="bg-flow h-1.5 w-1.5 rounded-full" /> Challenge
            </span>
          </div>
        </div>
        {lensSample === null ? (
          <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
            {sampleCards}
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center gap-3 p-4" aria-live="polite">
                <LoaderCircle className="text-flow h-5 w-5 animate-spin" aria-hidden="true" />
                <p className="text-ink-muted text-sm">Loading Reality Lens…</p>
              </div>
            }
          >
            <RealityLens
              key={lensSample.id}
              sample={lensSample}
              onBack={() => setLensSample(null)}
            />
          </Suspense>
        )}
      </div>
      )}
    </section>
  )
}
