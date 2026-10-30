import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, explainResult, providerBadge, type Netlist, type SimulateResult } from '../api/client'
import type { LessonSeed } from '../lessons/lesson'
import { compareRuns, describeRun, summarizeRun, type RunRecord } from './history'
import { EXPERIMENT_PRESETS } from './presets'

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
    return 'Deterministic prototype — no model call.'
  }
  return `Served by ${provider}.`
}

/** Free bench: build anything, run the solver, keep a session history.
 * No prediction gate, no ladder, no shared state with the guided lab. */
export default function ExperimentPage({ onReturnToLab }: { onReturnToLab?: () => void }) {
  const [bench, setBench] = useState<{ key: number; seed?: LessonSeed; label: string }>({
    key: 0,
    seed: undefined,
    label: 'Free build',
  })
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [runRequest, setRunRequest] = useState<number | undefined>(undefined)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [fresh, setFresh] = useState<{ result: SimulateResult; netlist: Netlist } | null>(null)
  const [ask, setAsk] = useState<AskState>({ phase: 'idle' })
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
    setBench((current) => ({ key: current.key + 1, seed: undefined, label: 'Free build' }))
  }, [])

  const handleSolved = useCallback(
    (result: SimulateResult, netlist: Netlist) => {
      setRuns((current) => [...current, describeRun(current.length + 1, bench.label, result, netlist)])
      setFresh({ result, netlist })
      setAsk({ phase: 'idle' })
    },
    [bench.label],
  )

  const handleDirty = useCallback(() => {
    controller.current?.abort()
    setFresh(null)
    setAsk({ phase: 'idle' })
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {onReturnToLab !== undefined && (
          <button
            type="button"
            onClick={onReturnToLab}
            className="border-glass-border min-h-[44px] w-fit rounded-[10px] border px-4 text-sm font-medium"
          >
            ← Back to guided journey
          </button>
        )}
      </div>
      <section aria-labelledby="experiment-heading" className="flex flex-col gap-2">
        <p className="text-flow text-xs font-semibold uppercase tracking-[0.18em]">Experiment</p>
        <h2 id="experiment-heading" className="text-xl font-semibold">
          Build something. Test what happens.
        </h2>
        <p className="text-ink-muted text-sm">
          Experiment freely with batteries, switches, bulbs, and wires. The simulator calculates
          the result after every test.
        </p>
      </section>

      <section aria-label="Starter experiments" className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Start from a working bench</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {EXPERIMENT_PRESETS.map((preset) => (
            <div key={preset.id} className="glass-panel flex flex-col gap-2 p-4">
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
          seed={bench.seed}
          runRequest={runRequest}
          eyebrow="Experiment · Free build"
          title="Free bench"
          instructions="Place parts, wire terminals, toggle switches — then run the experiment."
          onSolved={handleSolved}
          onDirty={handleDirty}
        />
      </Suspense>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-label="Run history" className="glass-panel flex flex-col gap-2 p-4">
          <h3 className="text-base font-semibold">Run history</h3>
          {runs.length === 0 ? (
            <p className="text-ink-muted text-sm">
              No runs yet. Run the experiment to record what the simulator measured.
            </p>
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
            <p className="text-ink-muted text-sm">
              Run the experiment first — explanations cover fresh solver results only.
            </p>
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
              <p className="text-sm">The coach is unavailable right now — your bench still works.</p>
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
