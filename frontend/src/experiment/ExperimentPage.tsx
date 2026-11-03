import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Sparkles } from 'lucide-react'
import {
  ApiError,
  explainResult,
  providerBadge,
  type ComponentCondition,
  type Netlist,
  type SimulateResult,
} from '../api/client'
import type { LessonSeed } from '../lessons/lesson'
import { latchedExplosion, validateBatteryVolts } from './bench'
import { BULB_OHMS, batteriesOppose, compareRuns, describeRun, diagnoseRun, measuredSourceVolts, summarizeRun, type RunRecord } from './history'
import { EXPERIMENT_PRESETS } from './presets'
import {
  POINT_STATE_LABEL,
  buildSweepPlan,
  pointState,
  summarizeSweep,
  type SweepPlan,
  type SweepPoint,
} from './stressRig'
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
}: {
  id: string
  volts: number
  onApply: (id: string, value: number) => void
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
        aria-label={`Apply ${id} voltage`}
        className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
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
    const code = result.error_code ?? 'rejected'
    return (
      <section aria-label="Latest result" className="glass-panel flex flex-col gap-2 p-4">
        <h3 className="text-base font-semibold">Latest result</h3>
        <p className="text-sm">Not testable ({code}).</p>
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
    <section aria-label="Latest result" className="glass-panel flex flex-col gap-3 p-4">
      <h3 className="text-base font-semibold">Latest result</h3>
      <p className="text-sm">Net source voltage: {sourceVolts.toFixed(1)} V</p>
      {opposingSources && (
        <p className="text-ink-muted text-sm">Some batteries face opposite directions, so they partly cancel.</p>
      )}
      {bulbs.length === 0 ? (
        <p className="text-ink-muted text-sm">No bulbs in this circuit.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-live="polite">
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
  | { phase: 'done'; plan: SweepPlan; points: SweepPoint[]; stopped: boolean }

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
}) {
  const running = rig.phase === 'running'
  const summary = rig.phase === 'done' ? summarizeSweep(rig.points) : []
  return (
    <section
      aria-label="Stress Test Rig"
      className="glass-panel relative flex flex-col gap-3 overflow-hidden p-4"
    >
      <div aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
      <h3 className="text-base font-semibold">Stress Test Rig</h3>
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
        <p className="text-sm" aria-live="polite">
          Point {rig.points.length + 1} of {rig.plan.points.length} · {rig.plan.batteryId} at{' '}
          {rig.plan.points[rig.points.length]} V
        </p>
      )}
      {rig.phase === 'done' &&
        (rig.points.length === 0 ? (
          <p className="text-ink-muted text-sm">Stopped before the first point recorded.</p>
        ) : (
          <div className="flex flex-col gap-2">
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
            <ul className="flex flex-col gap-1" aria-live="polite">
              {summary.map((line) => (
                <li key={line} className="text-sm">
                  {line}
                </li>
              ))}
            </ul>
            {rig.stopped && (
              <p className="text-ink-muted text-sm">
                Stopped early — the bench changed during the sweep.
              </p>
            )}
          </div>
        ))}
    </section>
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
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  /** Sweep chaining runs through onSolved callbacks (never effects), so
   * StrictMode's simulated remount cannot double-issue a point. */
  const rigRef = useRef(rig)
  rigRef.current = rig
  const runsRef = useRef(runs)
  runsRef.current = runs
  const rigPendingRef = useRef<{ batteryId: string; volts: number } | null>(null)
  /** Nonce bumps issued by this parent (rig points, Apply edits). Each
   * bump produces exactly one nonce-driven onDirty from the canvas;
   * counting them tells rig traffic apart from genuine user edits. */
  const nonceBumpRef = useRef(0)

  const issueRigPoint = useCallback((plan: SweepPlan, volts: number) => {
    rigPendingRef.current = { batteryId: plan.batteryId, volts }
    nonceBumpRef.current += 1
    setBatteryVolts((current) => ({ ...current, [plan.batteryId]: volts }))
    setBenchNonce((current) => current + 1)
    setRunRequest((current) => (current ?? 0) + 1)
  }, [])

  const abortRig = useCallback(() => {
    rigPendingRef.current = null
    setRig({ phase: 'idle' })
  }, [])

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
      setRig({ phase: 'running', plan: checked.plan, points: [] })
      issueRigPoint(checked.plan, checked.plan.points[0])
    },
    [issueRigPoint, rigStart, rigEnd, rigStep],
  )

  const cancelRig = useCallback(() => {
    rigPendingRef.current = null
    setRig((current) =>
      current.phase === 'running'
        ? { phase: 'done', plan: current.plan, points: current.points, stopped: true }
        : current,
    )
  }, [])

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
      if (activeRig.phase === 'running' && pending === null) {
        // A foreign run landed mid-sweep: keep the recorded points and stop.
        setRig({
          phase: 'done',
          plan: activeRig.plan,
          points: activeRig.points,
          stopped: true,
        })
      } else if (activeRig.phase === 'running' && pending !== null) {
        rigPendingRef.current = null
        label = `Rig ${pending.batteryId} ${pending.volts} V`
      }
      const record = describeRun(runsRef.current.length + 1, label, result, netlist)
      setRuns((current) => [...current, record])
      if (activeRig.phase === 'running' && pending !== null) {
        const points = [...activeRig.points, { setVolts: pending.volts, run: record }]
        if (points.length < activeRig.plan.points.length) {
          setRig({ phase: 'running', plan: activeRig.plan, points })
          issueRigPoint(activeRig.plan, activeRig.plan.points[points.length])
        } else {
          setRig({ phase: 'done', plan: activeRig.plan, points, stopped: false })
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
    // Nonce-driven dirties (rig points, Apply edits) keep a running
    // sweep alive; only genuine bench edits abort it. The explosion
    // latch survives rig traffic so post-blow points read latched.
    const nonceCaused = nonceBumpRef.current > 0
    if (nonceCaused) {
      nonceBumpRef.current -= 1
    } else {
      abortRig()
    }
    setFresh(null)
    setAsk({ phase: 'idle' })
    if (!nonceCaused || rigRef.current.phase !== 'running') {
      setBenchConditions({})
    }
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

  return (
    <div className="flex flex-col gap-6">
      {bench.label !== 'Free build' && (
        <p className="text-flow text-sm" role="status">Loaded circuit: {bench.label}</p>
      )}

      <section aria-label="Starter experiments" className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Start from a working bench</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {EXPERIMENT_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className={`glass-panel relative flex flex-col gap-2 overflow-hidden p-4 ${
                activePreset === preset.id ? 'border-flow/60' : ''
              }`}
            >
              {activePreset === preset.id && (
                <div aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
              )}
              <p className="text-base font-medium">{preset.title}</p>
              <p className="text-ink-muted text-sm">{preset.tagline}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => loadPreset(preset.id, false)}
                  aria-pressed={activePreset === preset.id}
                  className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => loadPreset(preset.id, true)}
                  className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
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
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Reset to blank
          </button>
          {activePrompt !== undefined && (
            <p className="text-ink-muted text-sm" aria-live="polite">
              {activePrompt}
            </p>
          )}
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Suspense fallback={<p className="text-ink-muted text-sm">Preparing the workbench…</p>}>
          <CircuitCanvas
            key={`experiment-${bench.key}`}
            mode="experiment"
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
          />
        </Suspense>

        <div className="flex min-w-0 flex-col gap-6">
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
                    />
                  )
                })}
              </div>
            </section>
          )}

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
                <li key={run.n} className="text-sm">
                  {summarizeRun(run)}
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
              <p className="text-ink-muted text-sm">
                Run the experiment first  -  explanations cover fresh solver results only.
              </p>
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
