import { useEffect, useRef, useState } from 'react'
import type { Netlist, SimulateResult, VerdictStatus } from '../api/client'
import { ApiError, evaluateClaim, simulate } from '../api/client'
import { glowIntensity } from '../canvas/visuals'
import type { Choice } from '../lessons/lesson'
import { CHOICE_LABELS, LIT_POWER_W, choiceToClaim } from '../lessons/lesson'
import { lensCulprit } from '../lens/culprit'
import type { LensSample } from '../lens/samples'
import ReadoutValue from './ReadoutValue'
import ResultBanner from './ResultBanner'
import SimulationResultView from './SimulationResultView'
import { VerdictIcon } from './verdict'
import { VERDICT_LABELS } from './verdictLabels'

const CHOICES = Object.entries(CHOICE_LABELS) as [Choice, string][]

type LensRun =
  | { phase: 'ready' }
  | { phase: 'solving' }
  | { phase: 'done'; result: SimulateResult; netlist: Netlist; open: boolean }
  | { phase: 'error'; message: string }

function DiagramOverlay({
  sample,
  result,
  culprit,
}: {
  sample: LensSample
  result: SimulateResult | null
  culprit: string | null
}) {
  const bulb = sample.boxes.bulb
  const power = result?.ok ? (result.components[sample.claim.component]?.power ?? 0) : 0
  const current = result?.ok
    ? Math.abs(result.components[sample.claim.component]?.current ?? 0)
    : 0
  const flowing = result !== null && result.ok && current > 1e-9
  const glow = result !== null && result.ok ? glowIntensity(power) : 0
  const cx = (bulb.left + bulb.right) / 2
  const cy = (bulb.top + bulb.bottom) / 2
  const stroke = Math.max(4, Math.round(sample.width / 140))
  const labelSize = Math.max(13, Math.round(sample.width / 46))
  const culpritRect = culprit !== null ? sample.switch : null
  return (
    <div className="border-glass-border relative overflow-hidden rounded-2xl border">
      <img
        src={sample.image}
        alt={`${sample.title} schematic diagram`}
        className="block h-auto w-full"
      />
      {glow > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            left: `${(cx / sample.width) * 100}%`,
            top: `${(cy / sample.height) * 100}%`,
            width: `${(((bulb.right - bulb.left) * 2.4) / sample.width) * 100}%`,
            aspectRatio: '1',
            transform: 'translate(-50%, -50%)',
            background:
              'radial-gradient(circle, var(--color-glow-light) 0%, transparent 62%)',
            filter: 'blur(8px)',
            opacity: glow,
          }}
        />
      )}
      <svg
        viewBox={`0 0 ${sample.width} ${sample.height}`}
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label={`Detected regions for ${sample.title}`}
      >
        {(
          [
            ['battery', sample.boxes.battery],
            ['bulb', sample.boxes.bulb],
          ] as const
        ).map(([name, box]) => (
          <g key={name}>
            <rect
              x={box.left}
              y={box.top}
              width={box.right - box.left}
              height={box.bottom - box.top}
              rx={6}
              className="lens-box"
            />
            <text
              x={box.left}
              y={Math.max(labelSize + 2, box.top - 6)}
              fontSize={labelSize}
              className="lens-label"
            >
              {name} · detected region
            </text>
          </g>
        ))}
        {result !== null &&
          sample.paths.map((path, index) => (
            <polyline
              key={index}
              points={path.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              strokeWidth={stroke}
              className={flowing ? 'lens-flow' : 'lens-idle'}
            />
          ))}
      </svg>
      {culpritRect !== null && (
        <div
          aria-hidden="true"
          className="lens-spotlight pointer-events-none absolute rounded-full"
          style={{
            left: `${(((culpritRect.left + culpritRect.right) / 2 / sample.width) * 100).toFixed(2)}%`,
            top: `${(((culpritRect.top + culpritRect.bottom) / 2 / sample.height) * 100).toFixed(2)}%`,
            width: `${(((culpritRect.right - culpritRect.left + 36) / sample.width) * 100).toFixed(2)}%`,
            aspectRatio: '1',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  )
}

/** Reality Lens: reviewed regions plus solver-driven physics on one diagram. */
export default function RealityLens({
  sample,
  onBack,
}: {
  sample: LensSample
  onBack: () => void
}) {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [run, setRun] = useState<LensRun>({ phase: 'ready' })
  const [verdict, setVerdict] = useState<{
    status: VerdictStatus
    evidence: Record<string, number>
  } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const requestId = useRef(0)

  useEffect(() => () => controller.current?.abort(), [])

  const solve = (open: boolean) => {
    if (!choice) {
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    requestId.current += 1
    const id = requestId.current
    setRun({ phase: 'solving' })
    setVerdict(null)
    const netlist: Netlist = {
      components: sample.netlist.components.map((component) =>
        sample.switch !== null && component.id === sample.switch.id
          ? { ...component, closed: !open }
          : component,
      ),
    }
    void (async () => {
      try {
        const result = await simulate(netlist, next.signal)
        if (requestId.current !== id) {
          return
        }
        setRun({ phase: 'done', result, netlist, open })
        const claim = choiceToClaim(choice, sample.claim)
        if (result.ok && claim) {
          try {
            const judged = await evaluateClaim(claim, netlist, next.signal)
            if (requestId.current !== id) {
              return
            }
            setVerdict({ status: judged.verdict.status, evidence: judged.verdict.evidence })
          } catch (verdictErr) {
            if (next.signal.aborted || requestId.current !== id) {
              return
            }
            setRun({
              phase: 'error',
              message: verdictErr instanceof ApiError ? verdictErr.message : 'Request failed.',
            })
          }
        }
      } catch (err) {
        if (next.signal.aborted || requestId.current !== id) {
          return
        }
        setRun({
          phase: 'error',
          message: err instanceof ApiError ? err.message : 'Request failed.',
        })
      }
    })()
  }

  const toggleSwitch = () => {
    const open = !switchOpen
    setSwitchOpen(open)
    solve(open)
  }

  const result = run.phase === 'done' ? run.result : null
  const culprit =
    run.phase === 'done' && verdict
      ? lensCulprit(run.netlist, run.result, verdict.status, sample.claim.component)
      : null
  const claim = choice ? choiceToClaim(choice, sample.claim) : null
  const observed =
    result?.ok && claim?.type === 'lit'
      ? result.components[claim.component]
      : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          ← Verified samples
        </button>
        <h3 className="text-lg font-semibold">{sample.title}</h3>
      </div>
      <p className="text-ink-muted text-sm">{sample.modelNote}</p>
      <p className="text-lg font-semibold">{sample.question}</p>
      <div className="flex gap-2" role="group" aria-label="Your prediction">
        {CHOICES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            onClick={() => setChoice(value)}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-[10px] border text-sm font-medium transition ${
              choice === value ? 'border-flow bg-glass-strong' : 'border-glass-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <DiagramOverlay sample={sample} result={result} culprit={culprit} />
      <p className="text-ink-muted text-xs">
        Verified segmentation preview · deterministic physics.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={choice === null || run.phase === 'solving'}
          onClick={() => solve(switchOpen)}
          className="bg-flow text-on-accent flex min-h-[44px] min-w-40 items-center justify-center rounded-[10px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {run.phase === 'solving' ? 'Simulating…' : 'Run simulator'}
        </button>
        {sample.switch !== null && run.phase !== 'ready' && (
          <button
            type="button"
            disabled={run.phase === 'solving'}
            onClick={toggleSwitch}
            aria-pressed={switchOpen}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            {switchOpen ? 'Close the switch' : 'Open the switch (what-if)'}
          </button>
        )}
      </div>
      {run.phase === 'done' && result?.ok && (
        <div className="evidence-reveal">
          <ResultBanner result={result} netlist={run.netlist} />
        </div>
      )}
      {run.phase === 'done' && result && <SimulationResultView result={result} />}
      {run.phase === 'done' && result?.ok && choice && (
        <div className="glass-panel evidence-reveal flex flex-col gap-1 p-4" aria-live="polite">
          {verdict ? (
            <>
              <div className="flex items-center gap-3">
                <VerdictIcon status={verdict.status} />
                <div>
                  <p className="text-base font-medium text-ink">{VERDICT_LABELS[verdict.status]}</p>
                  <p className="text-ink-muted text-sm">
                    <span className="font-medium text-ink">Your prediction:</span>{' '}
                    {claim?.type === 'lit'
                      ? claim.value
                        ? `${claim.component} lights`
                        : `${claim.component} stays dark`
                      : 'Prediction checked'}
                  </p>
                  {observed !== undefined && claim?.type === 'lit' && (
                    <p className="text-ink-muted text-sm">
                      <span className="font-medium text-ink">Observed:</span>{' '}
                      {observed.power > LIT_POWER_W
                        ? `${claim.component} lights`
                        : `${claim.component} stays dark`}
                      {' · '}
                      <ReadoutValue value={observed.current} unit="A" />
                      {' · '}
                      <ReadoutValue value={observed.power} unit="W" />
                    </p>
                  )}
                </div>
              </div>
              <p className="text-ink-muted pl-9 text-xs">
                Comparing against:{' '}
                {run.open ? 'circuit with the switch open' : 'diagram as drawn'}.
              </p>
              <p className="text-ink-muted pl-9 text-xs">
                This tests your prediction against the model, not you.
              </p>
            </>
          ) : (
            <p className="text-ink-muted text-sm">
              {choice === 'not_sure'
                ? 'You chose Not sure, so there is no definite prediction to check.'
                : 'Checking your prediction against the circuit result…'}
            </p>
          )}
        </div>
      )}
      {run.phase === 'done' && verdict?.status === 'CONTRADICTED' && (
        <div className="glass-panel evidence-reveal flex flex-col gap-2 p-4" aria-live="polite">
          <span className="border-glass-border w-fit rounded-full border px-3 py-1 text-xs font-medium text-ink">
            Sample guide
          </span>
          <p className="text-base">{sample.guide}</p>
          <p className="text-ink-muted text-xs">
            Written for this diagram — the live coach serves the Reality Check.
          </p>
        </div>
      )}
      {run.phase === 'error' && (
        <div className="glass-panel flex items-center gap-3 p-4" role="alert">
          <p className="min-w-0 flex-1 text-base">{run.message}</p>
          <button
            type="button"
            onClick={() => solve(switchOpen)}
            className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
