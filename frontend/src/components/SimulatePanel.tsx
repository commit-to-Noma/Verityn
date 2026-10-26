import { useEffect, useRef, useState } from 'react'
import { Check, CircleX, LoaderCircle } from 'lucide-react'
import type { SimulateResult } from '../api/client'
import { ApiError, simulate } from '../api/client'
import type { Preset } from '../data/presets'
import { PRESETS } from '../data/presets'
import SimulationResultView from './SimulationResultView'

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; result: SimulateResult }
  | { phase: 'error'; message: string }

interface SimulatePanelProps {
  preset: Preset
  onSelectPreset: (id: string) => void
}

/** Runs a preset circuit through POST /api/simulate and shows the outcome. */
export default function SimulatePanel({ preset, onSelectPreset }: SimulatePanelProps) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const requestId = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const run = (target: Preset) => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    requestId.current += 1
    const id = requestId.current
    setState({ phase: 'loading' })
    void (async () => {
      try {
        const result = await simulate(target.netlist, next.signal)
        if (requestId.current === id) {
          setState({ phase: 'done', result })
        }
      } catch (err) {
        if (next.signal.aborted || requestId.current !== id) {
          return
        }
        setState({
          phase: 'error',
          message: err instanceof ApiError ? err.message : 'Request failed.',
        })
      }
    })()
  }

  const selectPreset = (id: string) => {
    controller.current?.abort()
    requestId.current += 1
    onSelectPreset(id)
    setState({ phase: 'idle' })
  }

  return (
    <section aria-labelledby="simulate-heading" className="flex flex-col gap-4">
      <h2 id="simulate-heading" className="text-lg font-semibold">
        Try a circuit
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Example circuits">
        {PRESETS.map((option) => {
          const selected = option.id === preset.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => selectPreset(option.id)}
              className={`border-glass-border flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium text-ink ${
                selected ? 'border-flow' : ''
              }`}
            >
              {selected && <Check className="text-flow h-4 w-4" aria-hidden="true" />}
              {option.title}
            </button>
          )
        })}
      </div>
      <p className="text-ink-muted text-sm">{preset.description}</p>
      <div>
        <button
          type="button"
          disabled={state.phase === 'loading'}
          onClick={() => run(preset)}
          className="bg-flow text-on-accent flex min-h-[44px] min-w-40 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.phase === 'loading' ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Simulating…
            </>
          ) : (
            'Run simulation'
          )}
        </button>
      </div>
      {state.phase === 'done' && <SimulationResultView result={state.result} />}
      {state.phase === 'error' && (
        <div className="glass-panel flex items-center gap-3 p-4" role="alert">
          <CircleX className="text-bad h-6 w-6 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base">{state.message}</p>
          <button
            type="button"
            onClick={() => run(preset)}
            className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  )
}
