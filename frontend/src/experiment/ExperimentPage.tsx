import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Sparkles, Volume2, VolumeX } from 'lucide-react'
import {
  ApiError,
  explainResult,
  providerBadge,
  type ComponentCondition,
  type Netlist,
  type SimulateResult,
} from '../api/client'
import type { LessonSeed } from '../lessons/lesson'
import { latchedDamage, validateBatteryVolts } from './bench'
import { batteriesOppose, compareRuns, describeRun, measuredSourceVolts, summarizeRun, type RunRecord } from './history'
import { EXPERIMENT_PRESETS } from './presets'
import { isSoundEnabled, setSoundEnabled } from './sound'

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
        <span className="font-medium">{id}</span>
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
            aria-label={`Battery ${id} voltage in volts`}
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
  overloaded: 'Overloaded',
  damaged: 'Damaged',
}

const CONDITION_CLASS: Record<ComponentCondition, string> = {
  intact: 'text-ok',
  overloaded: 'text-light',
  damaged: 'text-bad',
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
  const anyOverloaded = bulbs.some((bulb) => conditions[bulb.id] === 'overloaded')
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
                  {bulb.id}
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
              </li>
            )
          })}
        </ul>
      )}
      {anyOverloaded && (
        <p className="text-sm">Overloaded bulbs fail on the next run. Reset the bench to restore them.</p>
      )}
      <p className="text-ink-muted text-xs">Measured by Verityn Solver.</p>
    </section>
  )
}

/** Free bench: build anything, run the solver, keep a session history.
 * No prediction gate, no ladder, no shared state with the guided lab. */
function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled)
  const Icon = on ? Volume2 : VolumeX
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Mute bench sounds' : 'Unmute bench sounds'}
      onClick={() => {
        const next = !on
        setOn(next)
        setSoundEnabled(next)
      }}
      className="border-glass-border flex min-h-[44px] shrink-0 items-center gap-2 rounded-[10px] border px-3 text-sm font-medium"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {on ? 'Sound on' : 'Muted'}
    </button>
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
  /** Session damage latch: overloaded bulbs fail on the next run. */
  const [benchConditions, setBenchConditions] = useState<Record<string, 'damaged'>>({})
  const [batteryVolts, setBatteryVolts] = useState<Record<string, number>>({})
  const [benchNonce, setBenchNonce] = useState(0)
  const [parts, setParts] = useState<{ id: string; kind: string; volts?: number }[]>([])
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const loadPreset = useCallback((id: string, andRun: boolean) => {
    const preset = EXPERIMENT_PRESETS.find((entry) => entry.id === id)
    if (preset === undefined) {
      return
    }
    controller.current?.abort()
    setAsk({ phase: 'idle' })
    setFresh(null)
    setActivePreset(id)
    setBenchConditions({})
    setBatteryVolts({})
    setBench((current) => ({ key: current.key + 1, seed: preset.seed, label: preset.title }))
    if (andRun) {
      setRunRequest((current) => (current ?? 0) + 1)
    }
  }, [])

  const resetBench = useCallback(() => {
    controller.current?.abort()
    setAsk({ phase: 'idle' })
    setFresh(null)
    setActivePreset(null)
    setBenchConditions({})
    setBatteryVolts({})
    setBench((current) => ({ key: current.key + 1, seed: undefined, label: 'Free build' }))
    setRunRequest(undefined)
  }, [])

  const handleSolved = useCallback(
    (result: SimulateResult, netlist: Netlist) => {
      setRuns((current) => [...current, describeRun(current.length + 1, bench.label, result, netlist)])
      setFresh({ result, netlist })
      setAsk({ phase: 'idle' })
      const latched = latchedDamage(result.conditions)
      if (Object.keys(latched).length > 0) {
        setBenchConditions((current) => ({ ...current, ...latched }))
      }
    },
    [bench.label],
  )

  const handleParts = useCallback((next: { id: string; kind: string; volts?: number }[]) => {
    setParts(next)
  }, [])

  const handleVoltage = useCallback((id: string, value: number) => {
    setBatteryVolts((current) => ({ ...current, [id]: value }))
    setBenchNonce((current) => current + 1)
  }, [])

  const handleDirty = useCallback(() => {
    controller.current?.abort()
    setFresh(null)
    setAsk({ phase: 'idle' })
    setBenchConditions({})
    // Edited benches log as free builds, even when a preset seeded them.
    setBench((current) => ({ ...current, label: 'Free build' }))
  }, [])

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

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="experiment-heading" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-flow text-xs font-semibold uppercase tracking-[0.18em]">Experiment</p>
            <h2 id="experiment-heading" className="text-xl font-semibold">
              Build something. Test what happens.
            </h2>
          </div>
          <SoundToggle />
        </div>
        <p className="text-ink-muted text-sm">
          Experiment freely with batteries, switches, bulbs, and wires. The simulator calculates
          the result after every test.
        </p>
        {bench.label !== 'Free build' && (
          <p className="text-flow text-sm" role="status">Loaded circuit: {bench.label}</p>
        )}
      </section>

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

      {fresh !== null && (
        <LatestResult fresh={fresh} previous={runs.length >= 2 ? runs[runs.length - 2] : null} />
      )}

      {batteries.length > 0 && (
        <section
          aria-label="Bench batteries"
          className="glass-panel relative flex flex-col gap-3 overflow-hidden p-4"
        >
          <div aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
          <h3 className="text-base font-semibold">Batteries</h3>
          <p className="text-ink-muted text-sm">
            Set a battery voltage, then run the experiment to measure what changes.
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
