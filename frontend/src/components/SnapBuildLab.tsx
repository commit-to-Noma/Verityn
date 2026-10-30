import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { CircleCheckBig, CircleQuestionMark, CircleX, LoaderCircle } from 'lucide-react'
import type { SimulateResult, VisionProposeResult } from '../api/client'
import { ApiError, proposeCircuit, visionProviderBadge } from '../api/client'
import type { ImageGeometry } from '../canvas/layout'
import { layoutProposalFromGeometry } from '../canvas/layout'
import { LIT_POWER_W, type LessonSeed } from '../lessons/lesson'
import type { LensSample } from '../lens/samples'
import { LENS_SAMPLES } from '../lens/samples'
import {
  DEFAULT_LENS_VIEW,
  LENS_VIEW_MODES,
  REVIEW_STATUS_LABELS,
  canLoadProposal,
  componentReviewStatus,
  connectionReviewStatus,
  nextRevealStep,
  polarityText,
  regionStyle,
  reviewBanner,
  reviewSummary,
  type LensViewMode,
  type RevealStep,
} from '../vision/review'
import { LENS_ACCEPT, validateLensFile } from '../vision/upload'
import { LENS_STEP_LABELS, lensSteps } from '../vision/steps'
import CircuitCanvas from './CircuitCanvas'
import ReadoutValue from './ReadoutValue'

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

/** Two-panel review: source diagram beside the editable replica. */
function ReviewPanels({
  image,
  size,
  result,
  nonce,
  confirmed,
  onConfirm,
  onTested,
  onReset,
}: {
  image: string
  size: ImageGeometry
  result: VisionProposeResult
  nonce: number
  confirmed: boolean
  onConfirm: () => void
  onTested: (result: SimulateResult) => void
  onReset: () => void
}) {
  const proposal = result.proposal
  const [view, setView] = useState<LensViewMode>(DEFAULT_LENS_VIEW)
  const [selection, setSelection] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [corrected, setCorrected] = useState(false)
  const [reveal, setReveal] = useState<RevealStep>(() => (reducedMotion() ? 'review' : 'image'))
  const replicaRef = useRef<HTMLDivElement | null>(null)

  const loadable = canLoadProposal(proposal)
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
      <div className="grid gap-4 xl:grid-cols-2" onPointerDown={interrupt}>
        {showOriginal && (
          <div className="glass-panel flex flex-col gap-3 p-4">
            <h4 className="text-base font-semibold">Original diagram</h4>
            <div className="relative self-start">
              <img src={image} alt="Uploaded schematic" className="max-h-64 rounded-[10px]" />
              {showOverlays && (
                <div className="absolute inset-0">
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
                      <span className="text-ink-muted ml-auto font-mono text-xs">
                        {component.evidence.region_id}
                      </span>
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
                      <span className="text-ink-muted ml-auto font-mono text-xs">
                        {connection.evidence.region_id}
                      </span>
                    </button>
                    {selection === id && status === 'connection-ambiguous' && (
                      <p className="text-ink-muted px-2 pb-1 text-xs">
                        Ambiguous: verify these endpoints on the replica before confirming. Wires
                        carry no image region — only the terminal relationship was proposed.
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="text-ink-muted text-xs">
              Terminal relationships are model-proposed; contact geometry is not traced from
              the image. Verify each wire on the replica before confirming.
            </p>
          </div>
        )}
        {showModel && (
          <div ref={replicaRef} className="glass-panel flex scroll-mt-4 flex-col gap-3 p-4">
            <h4 className="text-base font-semibold">Interactive circuit replica</h4>
            <p className="text-ink-muted text-xs">
              Positions mapped from the detected regions. Wire routes are reconstructed between
              the proposed terminals — not traced from the image.
            </p>
            {(reveal === 'replica' || reveal === 'review') && (
              <CircuitCanvas
                key={`review-${nonce}`}
                layout="stacked"
                importRequest={{ seed, uncertainIds, nonce }}
                simulateLocked={
                  confirmed ? null : 'Confirm the model below before testing it against the simulator.'
                }
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
    </div>
  )
}

/** Proof moment: the confirmed proposal's fresh solver measurements, nothing else. */
function LensProof({ result, bulbIds }: { result: SimulateResult; bulbIds: string[] }) {
  // Every value comes from the fresh solver response for the confirmed circuit.
  const measured = bulbIds.filter((id) => result.components[id] !== undefined)
  return (
    <div className="glow-card evidence-reveal flex flex-col gap-2 p-5" role="status">
      <p className="text-sm font-semibold">Confirmed circuit tested</p>
      {measured.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {measured.map((id) => {
            const reading = result.components[id]
            if (reading === undefined) {
              return null
            }
            return (
              <li key={id} className="glass-panel flex flex-col gap-0.5 rounded-[10px] p-3">
                <p className="font-mono text-sm font-medium">{id}</p>
                <p className="text-sm">
                  <ReadoutValue value={reading.current} unit="A" />
                </p>
                <p className="text-sm">
                  <ReadoutValue value={reading.power} unit="W" />
                </p>
                <p className="text-ink-muted text-xs">
                  {reading.power > LIT_POWER_W ? 'Bulb lit' : 'Bulb dark'}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm">The simulator solved your confirmed circuit with no faults.</p>
      )}
      <p className="text-sm">The solver measured this confirmed circuit.</p>
      <p className="text-ink-muted text-xs">Measured by Verityn Solver</p>
    </div>
  )
}

export default function SnapBuildLab({ onReturnToLab }: { onReturnToLab?: () => void }) {
  const [lensSample, setLensSample] = useState<LensSample | null>(null)
  const [state, setState] = useState<LabState>({ phase: 'idle' })
  const [confirmed, setConfirmed] = useState(false)
  const [tested, setTested] = useState(false)
  const [lensResult, setLensResult] = useState<SimulateResult | null>(null)
  const controller = useRef<AbortController | null>(null)
  const nonce = useRef(0)

  useEffect(() => () => controller.current?.abort(), [])

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
        const message = err instanceof ApiError ? err.message : 'Request failed.'
        const visionDown = message === 'Vision unavailable.'
        setState({
          phase: 'error',
          message: visionDown
            ? 'Meta vision is unavailable right now. Use a verified sample or return to the Guided Lab.'
            : message,
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

  return (
    <section aria-label="Diagram upload and review" className="flex flex-col gap-4">
      <div>
        <p className="text-ink-muted text-sm">
          Bring a circuit diagram to life. Meta Muse Spark proposes what it sees; you review the
          model, correct it if needed, and confirm it before Verityn Solver tests it.
        </p>
        <ol aria-label="Reality Lens progress" className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {LENS_STEP_LABELS.map((label, index) => {
            const stepState = steps[index] ?? 'todo'
            return (
              <li
                key={label}
                aria-current={stepState === 'current' ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  stepState === 'done'
                    ? 'border-ok/60 text-ink'
                    : stepState === 'current'
                      ? 'border-flow/60 text-ink'
                      : 'border-glass-border text-ink-muted'
                }`}
              >
                <span aria-hidden="true">
                  {stepState === 'done' ? '✓' : `${index + 1}`}
                </span>
                {label}
              </li>
            )
          })}
        </ol>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Your diagram</h3>
        <label className="glass-panel flex min-h-[44px] cursor-pointer items-center gap-3 p-4">
          <span className="border-glass-border rounded-[10px] border px-4 py-2 text-sm font-medium">
            {state.phase === 'idle' ? 'Choose an image' : 'Choose a different image'}
          </span>
          <span className="text-ink-muted text-sm">PNG, JPEG, or WebP, up to 4 MB.</span>
          <input
            type="file"
            accept={LENS_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              pickFile(event.target.files?.[0])
              // Allow selecting the same file twice in a row.
              event.target.value = ''
            }}
          />
        </label>
      </div>
      {(state.phase === 'selected' || state.phase === 'working') && (
        <div className="glass-panel flex flex-col gap-3 p-4">
          <img src={state.image} alt="Uploaded schematic" className="max-h-64 self-start rounded-[10px]" />
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
            </div>
          )}
          {state.phase === 'working' && (
            <div className="flex items-center gap-3" aria-live="polite">
              <LoaderCircle className="text-flow h-5 w-5 animate-spin" aria-hidden="true" />
              <p className="text-ink-muted text-sm">Reading the schematic…</p>
            </div>
          )}
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
                Use a verified sample
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
      <div id="lens-samples" className="flex scroll-mt-4 flex-col gap-3">
        <h3 className="text-base font-semibold">Verified samples</h3>
        <p className="text-ink-muted text-sm">
          Verified sample — use this when Meta vision is unavailable or when you want to rehearse
          the workflow.
        </p>
        <p className="text-ink-muted text-sm">
          Curated segmented diagrams with solver-backed physics. Regions are
          review evidence, not a correctness verdict; every number comes from
          the deterministic simulator.
        </p>
        {lensSample === null ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {LENS_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => setLensSample(sample)}
                className="glass-panel group flex flex-col gap-2 p-3 text-left"
              >
                <img
                  src={sample.image}
                  alt=""
                  className="h-28 w-full rounded-[10px] object-cover"
                />
                <span className="text-sm font-medium">{sample.title}</span>
                <span className="text-ink-muted text-xs">Open Reality Lens →</span>
              </button>
            ))}
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
      {state.phase === 'proposed' && (
        <div className="glass-panel flex flex-col gap-3 p-4">
          <ReviewPanels
            key={`proposal-${state.nonce}`}
            image={state.image}
            size={state.size}
            result={state.result}
            nonce={state.nonce}
            confirmed={confirmed}
            onConfirm={() => setConfirmed(true)}
            onTested={(result) => {
              setTested(true)
              setLensResult(result)
            }}
            onReset={reset}
          />
        </div>
      )}
      {state.phase === 'proposed' && confirmed && lensResult !== null && lensResult.ok && (
        <LensProof
          result={lensResult}
          bulbIds={state.result.proposal.components
            .filter((component) => component.type === 'bulb')
            .map((component) => component.id)}
        />
      )}
    </section>
  )
}
