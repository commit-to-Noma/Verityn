import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { VisionProposeResult } from '../api/client'
import { ApiError, VISION_MAX_IMAGE_BYTES, VISION_MIME_TYPES, proposeCircuit, providerBadge } from '../api/client'
import { layoutProposal } from '../canvas/layout'
import type { LessonSeed } from '../lessons/lesson'
import type { LensSample } from '../lens/samples'
import { LENS_SAMPLES } from '../lens/samples'
import CircuitCanvas from './CircuitCanvas'
import RealityLens from './RealityLens'

type LabState =
  | { phase: 'idle' }
  | { phase: 'selected'; image: string; name: string }
  | { phase: 'working'; image: string }
  | { phase: 'proposed'; image: string; result: VisionProposeResult }
  | { phase: 'loaded'; count: number; uncertain: number }
  | { phase: 'error'; message: string; image: string | null }

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Standalone vision lab: upload, inspect, confirm, then build normally. */
export default function SnapBuildLab() {
  const [lensSample, setLensSample] = useState<LensSample | null>(null)
  const [state, setState] = useState<LabState>({ phase: 'idle' })
  const [importRequest, setImportRequest] = useState<{
    seed: LessonSeed
    uncertainIds: string[]
    nonce: number
  } | null>(null)
  const nonce = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const pickFile = (file: File | undefined) => {
    if (!file) {
      return
    }
    if (!VISION_MIME_TYPES.includes(file.type)) {
      setState({ phase: 'error', message: 'Use a PNG, JPEG, or WebP image.', image: null })
      return
    }
    if (file.size > VISION_MAX_IMAGE_BYTES) {
      setState({
        phase: 'error',
        message: `Image is too large (${formatBytes(file.size)}; max ${formatBytes(VISION_MAX_IMAGE_BYTES)}).`,
        image: null,
      })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setState({ phase: 'selected', image: reader.result, name: file.name })
      } else {
        setState({ phase: 'error', message: 'Could not read that file.', image: null })
      }
    }
    reader.onerror = () => setState({ phase: 'error', message: 'Could not read that file.', image: null })
    reader.readAsDataURL(file)
  }

  const interpret = (image: string) => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setState({ phase: 'working', image })
    void (async () => {
      try {
        const result = await proposeCircuit(image, next.signal)
        if (next.signal.aborted) {
          return
        }
        setState({ phase: 'proposed', image, result })
      } catch (err) {
        if (next.signal.aborted) {
          return
        }
        const message = err instanceof ApiError ? err.message : 'Request failed.'
        setState({
          phase: 'error',
          message:
            message === 'Vision unavailable.'
              ? 'Vision needs a Meta API key on the backend. The rest of Verityn works without it.'
              : message,
          image,
        })
      }
    })()
  }

  const confirm = (result: VisionProposeResult) => {
    const { seed, uncertainIds } = layoutProposal(result.proposal)
    nonce.current += 1
    setImportRequest({ seed, uncertainIds, nonce: nonce.current })
    setState({
      phase: 'loaded',
      count: result.proposal.components.length,
      uncertain: uncertainIds.length,
    })
  }

  const reset = () => {
    controller.current?.abort()
    setImportRequest(null)
    setState({ phase: 'idle' })
  }

  const uncertainCount =
    state.phase === 'proposed'
      ? state.result.proposal.connections.filter((connection) => connection.uncertain).length
      : 0

  return (
    <section aria-labelledby="snap-build-heading" className="flex flex-col gap-4">
      <div>
        <p className="text-flow mb-1 text-xs font-semibold uppercase tracking-[0.18em]">Lab</p>
        <div className="flex items-center gap-3">
          <h2 id="snap-build-heading" className="text-xl font-semibold">
            Snap &amp; Build
          </h2>
          <span className="border-glass-border text-ink-muted rounded-full border px-3 py-1 text-xs">
            Experimental
          </span>
        </div>
        <p className="text-ink-muted mt-1 text-sm">
          Photograph a schematic, inspect what the vision model proposes, and load it to the
          canvas only when you confirm. Nothing proposed is simulated until you test it.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Verified samples</h3>
        <p className="text-ink-muted text-sm">
          SAM 3.1-segmented diagrams with solver-backed physics. Detection verified in the
          spike run; every number comes from the deterministic simulator.
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
          <RealityLens
            key={lensSample.id}
            sample={lensSample}
            onBack={() => setLensSample(null)}
          />
        )}
      </div>
      {state.phase === 'idle' && (
        <label className="glass-panel flex min-h-[44px] cursor-pointer items-center gap-3 p-4">
          <span className="border-glass-border rounded-[10px] border px-4 py-2 text-sm font-medium">
            Choose an image
          </span>
          <span className="text-ink-muted text-sm">PNG, JPEG, or WebP, up to 4 MB.</span>
          <input
            type="file"
            accept={VISION_MIME_TYPES.join(',')}
            className="sr-only"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
        </label>
      )}
      {(state.phase === 'selected' || state.phase === 'working' || state.phase === 'proposed') && (
        <div className="glass-panel flex flex-col gap-3 p-4">
          <img src={state.image} alt="Uploaded schematic" className="max-h-64 self-start rounded-[10px]" />
          {state.phase === 'selected' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => interpret(state.image)}
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
          {state.phase === 'proposed' && (
            <div className="flex flex-col gap-3" aria-live="polite">
              <span className="border-glass-border w-fit rounded-full border px-3 py-1 text-xs font-medium text-ink">
                {providerBadge(state.result.provider)}
              </span>
              {uncertainCount > 0 && (
                <p className="text-ink-muted text-sm" role="note">
                  {uncertainCount} of {state.result.proposal.connections.length} connections are
                  uncertain guesses — dashed grey on the canvas. Verify them before testing.
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {state.result.proposal.components.map((component) => (
                  <li key={component.id} className="flex items-baseline gap-2 text-sm">
                    <span className="font-mono font-medium">{component.id}</span>
                    <span className="text-ink-muted capitalize">{component.type}</span>
                    {component.type === 'switch' && (
                      <span className="text-ink-muted ml-auto">{component.closed ? 'closed' : 'open'}</span>
                    )}
                  </li>
                ))}
                {state.result.proposal.connections.map((connection, index) => (
                  <li key={`V${index + 1}`} className="flex items-baseline gap-2 text-sm">
                    <span className="font-mono font-medium">V{index + 1}</span>
                    <span className="text-ink-muted">
                      {connection.from.node}.{connection.from.terminal} ↔ {connection.to.node}.
                      {connection.to.terminal}
                    </span>
                    {connection.uncertain && (
                      <span className="text-ink-muted ml-auto text-xs">uncertain</span>
                    )}
                  </li>
                ))}
              </ul>
              {state.result.assumptions.map((assumption) => (
                <p key={assumption} className="text-ink-muted text-xs">
                  Assumed: {assumption}
                </p>
              ))}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => confirm(state.result)}
                  className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
                >
                  Load to canvas
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {state.phase === 'loaded' && (
        <div className="glass-panel flex items-center gap-3 p-4" aria-live="polite">
          <p className="text-ink-muted min-w-0 flex-1 text-sm">
            Loaded {state.count} parts{state.uncertain > 0 ? ` (${state.uncertain} uncertain)` : ''}.
            Edit freely, then Test circuit — nothing runs until you do.
          </p>
          <button
            type="button"
            onClick={reset}
            className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
          >
            Start over
          </button>
        </div>
      )}
      {state.phase === 'error' && (
        <div className="glass-panel flex items-center gap-3 p-4" role="alert">
          <p className="min-w-0 flex-1 text-sm">{state.message}</p>
          {state.image !== null && (
            <button
              type="button"
              onClick={() => interpret(state.image as string)}
              className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}
      {importRequest !== null && (
        <CircuitCanvas key={`lab-${importRequest.nonce}`} importRequest={importRequest} />
      )}
    </section>
  )
}
