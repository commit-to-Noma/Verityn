import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Sparkles } from 'lucide-react'
import {
  ApiError,
  explainResult,
  providerBadge,
  type ApiErrorKind,
  type ComponentCondition,
  type Netlist,
  type SimulateResult,
} from '../api/client'
import type { LessonSeed } from '../lessons/lesson'
import { latchedExplosion, validateBatteryVolts } from './bench'
import { BULB_OHMS, batteriesOppose, compareRuns, describeRun, diagnoseRun, friendlyErrorCode, hudReading, measuredSourceVolts, summarizeRun, type RunRecord } from './history'
import { EXPERIMENT_PRESETS } from './presets'
import {
  POINT_STATE_LABEL,
  buildSweepPlan,
  pointState,
  summarizeSweep,
  type SweepPlan,
  type SweepPoint,
} from './stressRig'
import {
  MISSIONS,
  initialMissionProgress,
  markSweepComplete,
  updateMissionProgress,
} from './missions'
import { friendlyComponentName } from '../components/componentNames'

const CircuitCanvas = lazy(() => import('../components/CircuitCanvas'))

type AskState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; text: string; provider: string }
  | { phase: 'error'; message: string }

function explainCaption(provider: string): string {
  if (provider === 'meta-spark') {
    return 'Guided by Meta Muse Spark · Grounded in simulator evidence.'
  }
  if (provider === 'prototype-fake') {
    return 'Deterministic prototype  -  no model call.'
  }
  return `Served by ${provider}.`
}

/** One bench battery row: a validated numeric control. The parent
 * remounts it (via key) when an applied voltage lands, resetting the
 * draft without an effect. */
function BatteryRow({
  id,
  volts,
  onApply,
  disabled = false,
}: {
  id: string
  volts: number
  onApply: (id: string, value: number) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(String(volts))
  const [error, setError] = useState<string | null>(null)

  const apply = () => {
    const checked = validateBatteryVolts(draft)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    onApply(id, checked.value)
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{friendlyComponentName(id)}</span>
        <span className="flex items-center gap-1">
          <input
            id={`battery-${id}-volts`}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                apply()
              }
            }}
            inputMode="decimal"
            aria-label={`${friendlyComponentName(id)} voltage in volts`}
            aria-invalid={error !== null}
            className="border-glass-border min-h-[44px] w-24 rounded-[10px] border bg-transparent px-3 text-sm"
          />
          <span className="text-ink-muted text-sm">V</span>
        </span>
      </label>
      <button
        type="button"
        onClick={apply}
        disabled={disabled}
        aria-label={`Apply ${id} voltage`}
        className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
      >
        Apply
      </button>
      {error !== null && (
        <p role="alert" className="text-bad w-full text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

const CONDITION_LABEL: Record<ComponentCondition, string> = {
  intact: 'Intact',
  overworked: 'Overworked',
  exploded: 'Exploded',
}

const CONDITION_CLASS: Record<ComponentCondition, string> = {
  intact: 'text-ok',
  overworked: 'text-light',
  exploded: 'text-bad',
}

/** Latest fresh run, per bulb: measured V/A/W against the safe limit,
 * with the delta from the previous run's same bulb when it exists. */
function LatestResult({
  fresh,
  previous,
}: {
  fresh: { result: SimulateResult; netlist: Netlist }
  previous: RunRecord | null
}) {
  const { result, netlist } = fresh
  if (!result.ok) {
    return (
      <section aria-label="Latest result" className="glass-panel flex flex-col gap-2 p-3">
        <h3 className="text-base font-semibold">Latest result</h3>
        <p className="text-sm">Not testable ({friendlyErrorCode(result.error_code)}).</p>
        <p className="text-ink-muted text-xs">Measured by Verityn Solver.</p>
      </section>
    )
  }
  const bulbs = netlist.components.filter((part) => part.type === 'bulb')
  const conditions = result.conditions ?? {}
  const anyOverworked = bulbs.some((bulb) => conditions[bulb.id] === 'overworked')
  const sourceVolts = measuredSourceVolts(result, netlist)
  const opposingSources = batteriesOppose(result, netlist)
  return (
    <section aria-label="Latest result" className="glass-panel flex flex-col gap-2 p-3">
      <h3 className="text-base font-semibold">Latest result</h3>
      <p className="text-sm">Net source voltage: {sourceVolts.toFixed(1)} V</p>
      {opposingSources && (
        <p className="text-ink-muted text-sm">Some batteries face opposite directions, so they partly cancel.</p>
      )}
      {bulbs.length === 0 ? (
        <p className="text-ink-muted text-sm">No bulbs in this circuit.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {bulbs.map((bulb) => {
            const measured = result.components[bulb.id]
            const condition = conditions[bulb.id]
            const limit = result.ratings?.[bulb.id]?.max_safe_watts
            const before = previous?.bulbs.find((entry) => entry.id === bulb.id) ?? null
            const delta =
              before === null || measured === undefined ? null : measured.power - before.watts
            return (
              <li key={bulb.id} className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {friendlyComponentName(bulb.id)}
                  {condition !== undefined && (
                    <span className={CONDITION_CLASS[condition]}>  -  {CONDITION_LABEL[condition]}</span>
                  )}
                </p>
                <p className="text-sm">
                  {measured === undefined
                    ? 'No reading.'
                    : `${measured.voltage.toFixed(1)} V · ${measured.current.toFixed(1)} A · ${measured.power.toFixed(1)} W`}
                  {limit !== undefined && (
                    <span className="text-ink-muted"> · Safe limit: {limit.toFixed(1)} W</span>
                  )}
                </p>
                {delta !== null && previous !== null && (
                  <p className="text-ink-muted text-sm">
                    {Math.abs(delta) < 0.05
                      ? `Same as run ${previous.n}.`
                      : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} W vs run ${previous.n}.`}
                  </p>
                )}
                {measured !== undefined && (
                  <details>
                    <summary className="text-flow w-fit cursor-pointer text-sm font-medium">
                      Why?
                    </summary>
                    <p className="text-ink-muted mt-1 font-mono text-sm">
                      {condition === 'exploded'
                        ? `Filament broken: no current flows (bulb reads ${measured.voltage.toFixed(1)} V, 0.0 A).`
                        : `I = V/R = ${measured.voltage.toFixed(1)} V / ${BULB_OHMS} Ω = ${(measured.voltage / BULB_OHMS).toFixed(1)} A (measured ${measured.current.toFixed(1)} A).`}
                    </p>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {anyOverworked && (
        <p className="text-sm">Overworked bulbs recover when the voltage drops. Past 18 V they explode, and only a reset restores them.</p>
      )}
      <p className="text-ink-muted text-xs">Measured by Verityn Solver.</p>
    </section>
  )
}

type RigState =
  | { phase: 'idle' }
  | { phase: 'running'; plan: SweepPlan; points: SweepPoint[] }
  | { phase: 'done'; plan: SweepPlan; points: SweepPoint[]; stopped: boolean; stopNote?: string }

/** Analog sweep gauge: needle climbs 0–24 V with amber/red zones past 12/18 V. */
function SweepGauge({ volts, max = 24 }: { volts: number; max?: number }) {
  const cx = 100
  const cy = 92
  const r = 72
  const point = (value: number, radius: number): [number, number] => {
    const frac = Math.min(Math.max(value, 0), max) / max
    const phi = Math.PI - frac * Math.PI * 0.999
    return [cx + radius * Math.cos(phi), cy - radius * Math.sin(phi)]
  }
  const arc = (from: number, to: number): string => {
    const [x0, y0] = point(from, r)
    const [x1, y1] = point(to, r)
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  const [nx, ny] = point(volts, r - 14)
  return (
    <div data-volts={volts}>
      <svg viewBox="0 0 200 104" role="img" aria-label={`Sweep gauge: ${volts} volts of ${max}`}>
        <path d={arc(0, max)} stroke="#374151" strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={arc(12, 18)} stroke="var(--color-light)" strokeWidth={10} fill="none" />
        <path d={arc(18, 24)} stroke="var(--color-bad)" strokeWidth={10} fill="none" />
        {[0, 6, 12, 18, 24].map((tick) => {
          const [x0, y0] = point(tick, r - 8)
          const [x1, y1] = point(tick, r - 16)
          const [tx, ty] = point(tick, r - 28)
          return (
            <g key={tick}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--color-ink-muted)" strokeWidth={1.5} />
              <text x={tx} y={ty} textAnchor="middle" fontSize={9} fill="var(--color-ink-muted)">
                {tick}
              </text>
            </g>
          )
        })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="var(--color-flow)" />
      </svg>
      <p className="text-center font-mono text-sm" aria-live="polite">
        {volts} V on the gauge
      </p>
    </div>
  )
}

/** Replay bar: scrub recorded points and re-run one for real. */
function ReplayBar({
  points,
  batteryId,
  onRerun,
}: {
  points: SweepPoint[]
  batteryId: string
  onRerun: (batteryId: string, volts: number) => void
}) {
  const [index, setIndex] = useState(0)
  const safe = Math.min(Math.max(index, 0), points.length - 1)
  const point = points[safe]
  return (
    <div className="border-glass-border flex flex-col gap-2 rounded-[10px] border p-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Replay sweep point</span>
        <input
          type="range"
          aria-label="Replay sweep point"
          min={0}
          max={points.length - 1}
          value={safe}
          onChange={(event) => setIndex(Number(event.target.value))}
          className="w-full accent-[var(--color-flow)]"
        />
      </label>
      <p className="text-sm" aria-live="polite">
        Point {safe + 1} of {points.length}: {point.setVolts} V →{' '}
        {POINT_STATE_LABEL[pointState(point)]}, {point.run.amps.toFixed(1)} A
      </p>
      <button
        type="button"
        onClick={() => onRerun(batteryId, point.setVolts)}
        className="border-glass-border min-h-[44px] self-start rounded-[10px] border px-4 text-sm font-medium"
      >
        Re-run this point
      </button>
    </div>
  )
}

/** Voltage-ladder sweep over one bench battery. Every point runs the
 * real bench through the normal path; the table only reads history. */
function StressRigPanel({
  batteries,
  rig,
  batteryId,
  onBatteryId,
  startDraft,
  onStartDraft,
  endDraft,
  onEndDraft,
  stepDraft,
  onStepDraft,
  error,
  onStart,
  onCancel,
  onRerun,
}: {
  batteries: { id: string }[]
  rig: RigState
  batteryId: string
  onBatteryId: (id: string) => void
  startDraft: string
  onStartDraft: (value: string) => void
  endDraft: string
  onEndDraft: (value: string) => void
  stepDraft: string
  onStepDraft: (value: string) => void
  error: string | null
  onStart: () => void
  onCancel: () => void
  onRerun: (batteryId: string, volts: number) => void
}) {
  const running = rig.phase === 'running'
  const summary = rig.phase === 'done' ? summarizeSweep(rig.points) : []
  return (
    <section
      aria-label="Stress Test Rig"
      className="glass-panel border-light/30 relative flex flex-col gap-3 overflow-hidden bg-black/25 p-4"
    >
      <div aria-hidden="true" className="bg-light absolute inset-x-0 top-0 h-0.5" />
      <h3 className="text-light text-base font-semibold">Stress Test Rig</h3>
      <p className="text-ink-muted text-sm">
        Step one battery through a voltage ladder and watch each threshold land. Every point is a
        real bench run, logged in the history below.
      </p>
      {batteries.length === 0 ? (
        <p className="text-ink-muted text-sm">Add a battery to the bench to run a sweep.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Battery</span>
            <select
              aria-label="Rig battery"
              value={batteryId}
              disabled={running}
              onChange={(event) => onBatteryId(event.target.value)}
              className="border-glass-border min-h-[44px] rounded-[10px] border bg-transparent px-3 text-sm"
            >
              {batteries.map((part) => (
                <option key={part.id} value={part.id}>
                  {friendlyComponentName(part.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Start V</span>
            <input
              id="rig-start-volts"
              aria-label="Sweep start volts"
              value={startDraft}
              disabled={running}
              onChange={(event) => onStartDraft(event.target.value)}
              inputMode="decimal"
              className="border-glass-border min-h-[44px] w-20 rounded-[10px] border bg-transparent px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">End V</span>
            <input
              id="rig-end-volts"
              aria-label="Sweep end volts"
              value={endDraft}
              disabled={running}
              onChange={(event) => onEndDraft(event.target.value)}
              inputMode="decimal"
              className="border-glass-border min-h-[44px] w-20 rounded-[10px] border bg-transparent px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Step V</span>
            <input
              id="rig-step-volts"
              aria-label="Sweep step volts"
              value={stepDraft}
              disabled={running}
              onChange={(event) => onStepDraft(event.target.value)}
              inputMode="decimal"
              className="border-glass-border min-h-[44px] w-20 rounded-[10px] border bg-transparent px-3 text-sm"
            />
          </label>
          {running ? (
            <button
              type="button"
              onClick={onCancel}
              className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
            >
              Cancel sweep
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
            >
              Run sweep
            </button>
          )}
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-bad text-sm">
          {error}
        </p>
      )}
      {rig.phase === 'running' && (
        <>
          <p className="text-sm" aria-live="polite">
            Point {rig.points.length + 1} of {rig.plan.points.length} · {rig.plan.batteryId} at{' '}
            {rig.plan.points[rig.points.length]} V
          </p>
          <SweepGauge
            volts={
              rig.points.length > 0
                ? rig.points[rig.points.length - 1].setVolts
                : rig.plan.points[0]
            }
          />
        </>
      )}
      {rig.phase === 'done' &&
        (rig.points.length === 0 ? (
          <p className="text-ink-muted text-sm">
            {rig.stopNote ?? 'Stopped before the first point recorded.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <SweepGauge volts={rig.points[rig.points.length - 1].setVolts} />
            <table className="w-full text-sm">
              <caption className="text-ink-muted pb-1 text-left text-xs">
                Sweep of {friendlyComponentName(rig.plan.batteryId)}: set volts against measured
                readings.
              </caption>
              <thead>
                <tr className="text-ink-muted text-left text-xs">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Set
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Net source
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Current
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Bulb power
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    State
                  </th>
                </tr>
              </thead>
              <tbody>
                {rig.points.map((point) => {
                  const watts =
                    point.run.bulbs.length === 0
                      ? null
                      : Math.max(...point.run.bulbs.map((bulb) => bulb.watts))
                  return (
                    <tr key={point.run.n} className="border-glass-border border-t">
                      <td className="py-1 pr-3 font-mono">{point.setVolts} V</td>
                      <td className="py-1 pr-3 font-mono">
                        {point.run.valid ? `${point.run.sourceVolts.toFixed(1)} V` : '—'}
                      </td>
                      <td className="py-1 pr-3 font-mono">
                        {point.run.valid ? `${point.run.amps.toFixed(1)} A` : '—'}
                      </td>
                      <td className="py-1 pr-3 font-mono">
                        {point.run.valid && watts !== null ? `${watts.toFixed(1)} W` : '—'}
                      </td>
                      <td className="py-1">{POINT_STATE_LABEL[pointState(point)]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <ReplayBar points={rig.points} batteryId={rig.plan.batteryId} onRerun={onRerun} />
            <ul className="flex flex-col gap-1" aria-live="polite">
              {summary.map((line) => (
                <li key={line} className="text-sm">
                  {line}
                </li>
              ))}
            </ul>
            {rig.stopped && (
              <p className="text-ink-muted text-sm">
                {rig.stopNote ?? 'Stopped early — the bench changed during the sweep.'}
              </p>
            )}
          </div>
        ))}
    </section>
  )
}

/** Color-coded outcome pill so the history scans at a glance. */
function RunPill({ run }: { run: RunRecord }) {
  if (!run.valid) {
    return (
      <span className="border-bad/60 text-bad shrink-0 rounded-full border px-2 py-px text-xs font-medium">
        {friendlyErrorCode(run.errorCode)}
      </span>
    )
  }
  if (run.bulbsLit > 0) {
    return (
      <span className="border-light/60 text-light shrink-0 rounded-full border px-2 py-px text-xs font-medium">
        Lit
      </span>
    )
  }
  if (run.bulbCount === 0) {
    return (
      <span className="border-glass-border text-ink-muted shrink-0 rounded-full border px-2 py-px text-xs font-medium">
        No bulbs
      </span>
    )
  }
  return (
    <span className="border-glass-border text-ink-muted shrink-0 rounded-full border px-2 py-px text-xs font-medium">
      Dark
    </span>
  )
}

/** Saved parameters for one history run: per-bulb readings and conditions. */
function RunDetail({ run }: { run: RunRecord }) {
  return (
    <div className="border-glass-border rounded-[10px] border p-3" aria-live="polite">
      <p className="text-sm font-medium">
        Run {run.n} — {run.label}
      </p>
      {!run.valid ? (
        <p className="text-ink-muted text-sm">
          No readings — not testable ({friendlyErrorCode(run.errorCode)}).
        </p>
      ) : run.bulbs.length === 0 ? (
        <p className="text-ink-muted text-sm">
          Net source {run.sourceVolts.toFixed(1)} V · {run.amps.toFixed(1)} A · no bulbs on the
          bench.
        </p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {run.bulbs.map((bulb) => (
            <li key={bulb.id} className="font-mono text-xs">
              {friendlyComponentName(bulb.id)}: {bulb.volts.toFixed(1)} V ·{' '}
              {bulb.amps.toFixed(1)} A · {bulb.watts.toFixed(1)} W
              {bulb.condition !== null && ` · ${bulb.condition}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Auto failure analysis from the solver's numbers (no model call). */
function DiagnosticsCard({
  fresh,
  previous,
}: {
  fresh: { result: SimulateResult; netlist: Netlist }
  previous: RunRecord | null
}) {
  const lines = diagnoseRun(fresh.result, fresh.netlist, previous)
  if (lines.length === 0) {
    return null
  }
  return (
    <div className="border-bad/50 bg-bad/5 rounded-[10px] border p-3" role="status">
      <p className="text-bad text-xs font-semibold uppercase tracking-[0.14em]">
        ⚠️ Bench diagnostics · from solver numbers
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line} className="text-sm">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ExperimentPage({
  initialSeed,
  initialLabel,
}: {
  initialSeed?: LessonSeed
  initialLabel?: string
}) {
  const [bench, setBench] = useState<{ key: number; seed?: LessonSeed; label: string }>(() => ({
    key: 0,
    seed: initialSeed,
    label: initialLabel ?? 'Free build',
  }))
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [runRequest, setRunRequest] = useState<number | undefined>(undefined)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [fresh, setFresh] = useState<{ result: SimulateResult; netlist: Netlist } | null>(null)
  const [ask, setAsk] = useState<AskState>({ phase: 'idle' })
  /** Session explosion latch: exploded bulbs stay exploded until reset. */
  const [benchConditions, setBenchConditions] = useState<Record<string, 'exploded'>>({})
  const [batteryVolts, setBatteryVolts] = useState<Record<string, number>>({})
  const [benchNonce, setBenchNonce] = useState(0)
  const [parts, setParts] = useState<{ id: string; kind: string; volts?: number }[]>([])
  const [rig, setRig] = useState<RigState>({ phase: 'idle' })
  const [rigBattery, setRigBattery] = useState('')
  const [rigStart, setRigStart] = useState('2')
  const [rigEnd, setRigEnd] = useState('24')
  const [rigStep, setRigStep] = useState('2')
  const [rigError, setRigError] = useState<string | null>(null)
  const [missions, setMissions] = useState(initialMissionProgress)
  const [selectedRun, setSelectedRun] = useState<number | null>(null)
  const [missionsOpen, setMissionsOpen] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  /** Sweep chaining runs through onSolved callbacks (never effects), so
   * StrictMode's simulated remount cannot double-issue a point. */
  const rigRef = useRef(rig)
  rigRef.current = rig
  const runsRef = useRef(runs)
  runsRef.current = runs
  const rigPendingRef = useRef<{ batteryId: string; volts: number } | null>(null)
  /** One-shot history label for a replayed sweep point. */
  const replayLabelRef = useRef<string | null>(null)
  /** True once a run fails terminally; cleared by the next solved run. */
  const [simDown, setSimDown] = useState(false)
  /** Nonce bumps issued by this parent (rig points, Apply edits). Each
   * bump produces exactly one nonce-driven onDirty from the canvas;
   * counting them tells rig traffic apart from genuine user edits. */
  const nonceBumpRef = useRef(0)
  /** Pacing timer between sweep points; cleared on cancel, abort, unmount. */
  const rigIssueTimer = useRef<number | null>(null)
  const clearRigTimer = useCallback(() => {
    if (rigIssueTimer.current !== null) {
      window.clearTimeout(rigIssueTimer.current)
      rigIssueTimer.current = null
    }
  }, [])
  useEffect(() => clearRigTimer, [clearRigTimer])

  const issueRigPoint = useCallback((plan: SweepPlan, volts: number) => {
    rigPendingRef.current = { batteryId: plan.batteryId, volts }
    nonceBumpRef.current += 1
    setBatteryVolts((current) => ({ ...current, [plan.batteryId]: volts }))
    setBenchNonce((current) => current + 1)
    setRunRequest((current) => (current ?? 0) + 1)
  }, [])

  const abortRig = useCallback(() => {
    rigPendingRef.current = null
    clearRigTimer()
    setRig({ phase: 'idle' })
  }, [clearRigTimer])

  const startRig = useCallback(
    (batteryId: string) => {
      if (rigRef.current.phase === 'running') {
        return
      }
      if (batteryId === '') {
        setRigError('Add a battery to the bench to run a sweep.')
        return
      }
      const checked = buildSweepPlan(batteryId, rigStart, rigEnd, rigStep)
      if (!checked.ok) {
        setRigError(checked.error)
        return
      }
      setRigError(null)
      clearRigTimer()
      replayLabelRef.current = null
      setRig({ phase: 'running', plan: checked.plan, points: [] })
      issueRigPoint(checked.plan, checked.plan.points[0])
    },
    [clearRigTimer, issueRigPoint, rigStart, rigEnd, rigStep],
  )

  const rerunRigPoint = useCallback((batteryId: string, volts: number) => {
    // A replay is one real run at recorded volts, logged like any run.
    replayLabelRef.current = `Rig ${batteryId} ${volts} V replay`
    nonceBumpRef.current += 1
    setBatteryVolts((current) => ({ ...current, [batteryId]: volts }))
    setBenchNonce((current) => current + 1)
    setRunRequest((current) => (current ?? 0) + 1)
  }, [])

  const cancelRig = useCallback(() => {
    rigPendingRef.current = null
    clearRigTimer()
    const active = rigRef.current
    if (active.phase === 'running' && active.points.length >= 2) {
      setMissions((current) => markSweepComplete(current, active.points.length))
    }
    setRig((current) =>
      current.phase === 'running'
        ? {
            phase: 'done',
            plan: current.plan,
            points: current.points,
            stopped: true,
            stopNote: 'Sweep cancelled — recorded points kept.',
          }
        : current,
    )
  }, [clearRigTimer])

  const loadPreset = useCallback(
    (id: string, andRun: boolean) => {
      const preset = EXPERIMENT_PRESETS.find((entry) => entry.id === id)
      if (preset === undefined) {
        return
      }
      controller.current?.abort()
      abortRig()
      setAsk({ phase: 'idle' })
      setFresh(null)
      setActivePreset(id)
      setBenchConditions({})
      setBatteryVolts({})
      setBench((current) => ({ key: current.key + 1, seed: preset.seed, label: preset.title }))
      if (andRun) {
        setRunRequest((current) => (current ?? 0) + 1)
      }
    },
    [abortRig],
  )

  const resetBench = useCallback(() => {
    controller.current?.abort()
    abortRig()
    setAsk({ phase: 'idle' })
    setFresh(null)
    setActivePreset(null)
    setBenchConditions({})
    setBatteryVolts({})
    setBench((current) => ({ key: current.key + 1, seed: undefined, label: 'Free build' }))
    setRunRequest(undefined)
  }, [abortRig])

  const handleSolved = useCallback(
    (result: SimulateResult, netlist: Netlist) => {
      const activeRig = rigRef.current
      const pending = rigPendingRef.current
      let label = bench.label
      if (replayLabelRef.current !== null) {
        label = replayLabelRef.current
        replayLabelRef.current = null
      }
      if (activeRig.phase === 'running' && pending === null) {
        // A foreign run landed mid-sweep: keep the recorded points and stop.
        setRig({
          phase: 'done',
          plan: activeRig.plan,
          points: activeRig.points,
          stopped: true,
        })
        setMissions((current) => markSweepComplete(current, activeRig.points.length))
      } else if (activeRig.phase === 'running' && pending !== null) {
        rigPendingRef.current = null
        label = `Rig ${pending.batteryId} ${pending.volts} V`
      }
      const record = describeRun(runsRef.current.length + 1, label, result, netlist)
      setRuns((current) => [...current, record])
      setSimDown(false)
      setMissions((current) => updateMissionProgress(current, record, result, netlist))
      if (activeRig.phase === 'running' && pending !== null) {
        const points = [...activeRig.points, { setVolts: pending.volts, run: record }]
        if (!record.valid) {
          // A locked bench rejects every point identically: stop at the first.
          setRig({
            phase: 'done',
            plan: activeRig.plan,
            points,
            stopped: true,
            stopNote: `Sweep stopped: ${friendlyErrorCode(record.errorCode)}. Fix the bench and run again.`,
          })
          setMissions((current) => markSweepComplete(current, points.length))
        } else if (points.length < activeRig.plan.points.length) {
          setRig({ phase: 'running', plan: activeRig.plan, points })
          // Cinema pacing: short sweeps take at least 5 s so the climb
          // reads; long sweeps keep the 400 ms floor between points.
          const pace = Math.max(400, Math.ceil(5000 / activeRig.plan.points.length))
          rigIssueTimer.current = window.setTimeout(() => {
            rigIssueTimer.current = null
            issueRigPoint(activeRig.plan, activeRig.plan.points[points.length])
          }, pace)
        } else {
          setRig({ phase: 'done', plan: activeRig.plan, points, stopped: false })
          setMissions((current) => markSweepComplete(current, points.length))
        }
      }
      setFresh({ result, netlist })
      setAsk({ phase: 'idle' })
      const latched = latchedExplosion(result.conditions)
      if (Object.keys(latched).length > 0) {
        setBenchConditions((current) => ({ ...current, ...latched }))
      }
    },
    [bench.label, issueRigPoint],
  )

  const handleParts = useCallback((next: { id: string; kind: string; volts?: number }[]) => {
    setParts(next)
  }, [])

  /** Terminal run failure (retry budget spent): never leave a running
   * sweep locked — stop it with its recorded points and a clear note. */
  const handleFailed = useCallback((kind?: ApiErrorKind) => {
    setSimDown(true)
    const active = rigRef.current
    if (active.phase !== 'running') {
      return
    }
    rigPendingRef.current = null
    clearRigTimer()
    setRig({
      phase: 'done',
      plan: active.plan,
      points: active.points,
      stopped: true,
      stopNote:
        kind === 'network' || kind === undefined
          ? 'Sweep stopped: simulator connection lost. Check the backend and run again.'
          : 'Sweep stopped: unexpected simulator response. Restart the backend and run again.',
    })
    setMissions((current) => markSweepComplete(current, active.points.length))
  }, [clearRigTimer])

  const handleVoltage = useCallback(
    (id: string, value: number) => {
      // A manual Apply mid-sweep hands the bench back to the learner.
      if (rigRef.current.phase === 'running') {
        cancelRig()
      }
      nonceBumpRef.current += 1
      setBatteryVolts((current) => ({ ...current, [id]: value }))
      setBenchNonce((current) => current + 1)
    },
    [cancelRig],
  )

  const handleDirty = useCallback(() => {
    controller.current?.abort()
    // Nonce-driven dirties (rig points, Apply edits, replays) keep a
    // running sweep alive; only genuine bench edits abort it. Damage
    // survives voltage edits — only preset loads and resets clear it.
    const nonceCaused = nonceBumpRef.current > 0
    if (nonceCaused) {
      nonceBumpRef.current -= 1
    } else {
      abortRig()
      setBenchConditions({})
    }
    setFresh(null)
    setAsk({ phase: 'idle' })
    // Edited benches log as free builds, even when a preset seeded them.
    setBench((current) => ({ ...current, label: 'Free build' }))
  }, [abortRig])

  const handleAsk = useCallback(() => {
    if (fresh === null || ask.phase === 'loading') {
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setAsk({ phase: 'loading' })
    explainResult(fresh.netlist, next.signal).then(
      (answer) => {
        if (next.signal.aborted) {
          return
        }
        setAsk({ phase: 'done', text: answer.text, provider: answer.provider })
      },
      (err: unknown) => {
        if (next.signal.aborted) {
          return
        }
        setAsk({
          phase: 'error',
          message: err instanceof ApiError ? err.message : 'Request failed.',
        })
      },
    )
  }, [fresh, ask.phase])

  const activePrompt = EXPERIMENT_PRESETS.find((entry) => entry.id === activePreset)?.prompt
  const lastRun = runs[runs.length - 1] ?? null
  const prevRun = runs[runs.length - 2] ?? null
  const comparison = lastRun === null ? null : compareRuns(prevRun, lastRun)
  const batteries = parts.filter((part) => part.kind === 'battery')
  const rigBatteryId = batteries.some((part) => part.id === rigBattery)
    ? rigBattery
    : (batteries[0]?.id ?? '')
  const hud = fresh === null ? null : hudReading(fresh.result, fresh.netlist)
  const rigRunning = rig.phase === 'running'

  return (
    <div className="flex flex-col gap-6">
      {bench.label !== 'Free build' && (
        <p className="text-flow text-sm" role="status">Loaded circuit: {bench.label}</p>
      )}

      <section aria-label="Starter experiments" className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Start from a working bench</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {EXPERIMENT_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className={`glass-panel relative flex flex-col gap-2 overflow-hidden p-4 ${
                activePreset === preset.id
                  ? 'border-flow shadow-[0_0_24px_-6px_var(--color-flow)]'
                  : ''
              }`}
            >
              {activePreset === preset.id && (
                <div aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
              )}
              <div className="flex items-center gap-2">
                <p className="text-base font-medium">{preset.title}</p>
                {activePreset === preset.id && (
                  <span className="bg-flow text-on-accent shrink-0 rounded-full px-2 py-px text-[11px] font-semibold">
                    In progress
                  </span>
                )}
              </div>
              <p className="text-ink-muted text-sm">{preset.tagline}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => loadPreset(preset.id, false)}
                  disabled={rigRunning}
                  aria-pressed={activePreset === preset.id}
                  className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => loadPreset(preset.id, true)}
                  disabled={rigRunning}
                  className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Test
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={resetBench}
            disabled={rigRunning}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset to blank
          </button>
          <button
            type="button"
            onClick={() => setMissionsOpen((current) => !current)}
            aria-expanded={missionsOpen}
            aria-controls="mission-drawer"
            className="border-glass-border flex min-h-[44px] items-center gap-2 rounded-[10px] border px-4 text-sm font-medium"
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            Mission Log ({missions.done.length} of {MISSIONS.length})
          </button>
          {activePrompt !== undefined && (
            <p className="text-ink-muted text-sm" aria-live="polite">
              {activePrompt}
            </p>
          )}
        </div>
      </section>

      <div
        id="mission-drawer"
        role="dialog"
        aria-label="Missions"
        aria-hidden={!missionsOpen}
        inert={!missionsOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setMissionsOpen(false)
          }
        }}
        className={`border-glass-border fixed top-0 left-0 z-40 flex h-full w-80 max-w-[85vw] flex-col gap-3 overflow-y-auto border-r bg-[#0b0f17]/95 p-4 backdrop-blur transition-[transform,visibility] duration-300 ${
          missionsOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">Missions</h3>
          <button
            type="button"
            onClick={() => setMissionsOpen(false)}
            aria-label="Close mission log"
            className="border-glass-border ml-auto min-h-[36px] rounded-[10px] border px-3 text-xs font-medium"
          >
            Close
          </button>
        </div>
        <p className="text-ink-muted text-sm" aria-live="polite">
          {missions.done.length} of {MISSIONS.length} complete — session challenges, in any order.
        </p>
        <div className="flex flex-col gap-3">
          {MISSIONS.map((mission) => {
            const done = missions.done.includes(mission.id)
            return (
              <div
                key={mission.id}
                data-mission={mission.id}
                className="glass-panel relative flex flex-col gap-1 overflow-hidden p-4"
              >
                {done && (
                  <div aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
                )}
                <p className="text-base font-medium">{mission.title}</p>
                <p className="text-ink-muted text-sm">{mission.goal}</p>
                <p className={`text-sm font-medium ${done ? 'text-ok' : 'text-flow'}`}>
                  {done ? 'Done' : mission.hint(missions)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="relative min-w-0">
        <Suspense fallback={<p className="text-ink-muted text-sm">Preparing the workbench…</p>}>
          <CircuitCanvas
            key={`experiment-${bench.key}`}
            mode="experiment"
            layout="stacked"
            proofStage="experiment"
            seed={bench.seed}
            runRequest={runRequest}
            eyebrow={`Experiment · ${bench.label}`}
            title={bench.label === 'Free build' ? 'Free bench' : bench.label}
            instructions="Place parts, wire terminals, toggle switches  -  then run the experiment."
            benchConditions={benchConditions}
            batteryVolts={batteryVolts}
            benchNonce={benchNonce}
            onParts={handleParts}
            onSolved={handleSolved}
            onDirty={handleDirty}
            hud={hud}
            onFailed={handleFailed}
          />
        </Suspense>
        {rigRunning && (
          <div
            role="status"
            aria-label="Sweep running, bench locked"
            className="absolute inset-0 z-20 cursor-not-allowed rounded-2xl"
          >
            <p className="border-glass-border absolute left-3 top-3 rounded-full border bg-black/70 px-3 py-1 font-mono text-xs">
              Sweep running — bench locked
              {rig.phase === 'running' && (
                <>
                  {' '}· Point {Math.min(rig.points.length + 1, rig.plan.points.length)} of{' '}
                  {rig.plan.points.length} · {rig.plan.batteryId} at{' '}
                  {rig.plan.points[Math.min(rig.points.length, rig.plan.points.length - 1)]} V
                </>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {batteries.length > 0 && (
          <section
            aria-label="Bench batteries"
            className="glass-panel relative flex flex-col gap-3 overflow-hidden p-4"
          >
            <div aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
            <h3 className="text-base font-semibold">Batteries</h3>
            <p className="text-ink-muted text-sm">
              Set a battery voltage, then run the experiment to measure what changes.
              Double-click a battery on the bench to flip its polarity.
            </p>
            <div className="flex flex-wrap gap-4">
              {batteries.map((part) => {
                const applied = batteryVolts[part.id] ?? part.volts ?? 6
                return (
                  <BatteryRow
                    key={`${bench.key}:${part.id}:${applied}`}
                    id={part.id}
                    volts={applied}
                    onApply={handleVoltage}
                    disabled={rigRunning}
                  />
                )
              })}
            </div>
          </section>
        )}

        <div className={batteries.length === 0 ? 'min-w-0 lg:col-span-2' : 'min-w-0'}>
          <StressRigPanel
            batteries={batteries}
            rig={rig}
            batteryId={rigBatteryId}
            onBatteryId={setRigBattery}
            startDraft={rigStart}
            onStartDraft={setRigStart}
            endDraft={rigEnd}
            onEndDraft={setRigEnd}
            stepDraft={rigStep}
            onStepDraft={setRigStep}
            error={rigError}
            onStart={() => startRig(rigBatteryId)}
            onCancel={cancelRig}
            onRerun={rerunRigPoint}
          />
        </div>
      </div>

      {fresh !== null && (
        <LatestResult fresh={fresh} previous={runs.length >= 2 ? runs[runs.length - 2] : null} />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-label="Run history" className="glass-panel flex flex-col gap-2 p-4">
          <h3 className="text-base font-semibold">Run history</h3>
          {runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <ClipboardList className="text-ink-muted h-10 w-10 opacity-40" aria-hidden="true" />
              <p className="text-ink-muted text-sm">
                Your data will appear here. Build a circuit to start logging!
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-1">
              {runs.map((run) => (
                <li key={run.n} className="flex flex-col gap-1">
                  <button
                    type="button"
                    data-run={run.n}
                    aria-expanded={selectedRun === run.n}
                    onClick={() => setSelectedRun((current) => (current === run.n ? null : run.n))}
                    className="flex w-full flex-wrap items-center gap-2 rounded-[8px] px-1 py-0.5 text-left text-sm"
                  >
                    <span>{summarizeRun(run)}</span>
                    <RunPill run={run} />
                  </button>
                  {selectedRun === run.n && <RunDetail run={run} />}
                </li>
              ))}
            </ol>
          )}
          {comparison !== null && <p className="text-ink-muted text-sm">{comparison}</p>}
        </section>

        <section aria-label="Ask about this result" className="glass-panel flex flex-col gap-3 p-4">
          <h3 className="text-base font-semibold">Ask Muse Spark about this result</h3>
          {fresh === null ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Sparkles className="text-ink-muted h-10 w-10 opacity-40" aria-hidden="true" />
              {simDown ? (
                <div className="flex flex-col gap-1">
                  <p className="text-sm">
                    The simulator is unreachable, so there is nothing to explain yet. Check that
                    the backend is running, then run the experiment.
                  </p>
                  <p className="text-ink-muted text-xs">Local notice — no model call.</p>
                </div>
              ) : (
                <p className="text-ink-muted text-sm">
                  Run the experiment first  -  explanations cover fresh solver results only.
                </p>
              )}
            </div>
          ) : (
            <p className="text-ink-muted text-sm">
              Optional: the coach explains the measurements above. It cannot change your circuit.
            </p>
          )}
          {fresh !== null && <DiagnosticsCard fresh={fresh} previous={prevRun} />}
          <div>
            <button
              type="button"
              onClick={handleAsk}
              disabled={fresh === null || ask.phase === 'loading'}
              className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ask.phase === 'loading' ? 'Asking…' : 'Ask Muse Spark about this result'}
            </button>
          </div>
          {ask.phase === 'done' && (
            <div className="flex flex-col gap-1" aria-live="polite">
              <p className="text-sm">{ask.text}</p>
              <p className="text-ink-muted text-xs">
                {providerBadge(ask.provider)} · {explainCaption(ask.provider)}
              </p>
            </div>
          )}
          {ask.phase === 'error' && (
            <div className="flex flex-col gap-2" role="alert">
              <p className="text-sm">The coach is unavailable right now  -  your bench still works.</p>
              <p className="text-ink-muted text-sm">{ask.message}</p>
              <div>
                <button
                  type="button"
                  onClick={handleAsk}
                  className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
