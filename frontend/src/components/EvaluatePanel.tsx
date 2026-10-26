import { useEffect, useRef, useState } from 'react'
import { Check, CircleCheckBig, CircleQuestionMark, CircleX, LoaderCircle } from 'lucide-react'
import type { Claim, VerdictResult, VerdictStatus } from '../api/client'
import { ApiError, evaluateClaim } from '../api/client'
import type { Preset } from '../data/presets'
import ReadoutValue from './ReadoutValue'

const VERDICT_LABELS: Record<VerdictStatus, string> = {
  CONSISTENT: 'Consistent with the model',
  CONTRADICTED: 'Contradicted by the model',
  UNASSESSABLE: "Can't assess",
}

interface JudgedClaim {
  label: string
  text: string
  verdict: VerdictResult
}

type State =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; verdicts: JudgedClaim[] }
  | { phase: 'error'; message: string }

function claimText(claim: Claim): string {
  if (claim.type === 'lit') {
    return claim.value ? `${claim.component} lights` : `${claim.component} stays dark`
  }
  if (claim.relation === 'equal') {
    return `${claim.a} equally bright as ${claim.b}`
  }
  return claim.relation === 'brighter'
    ? `${claim.a} brighter than ${claim.b}`
    : `${claim.a} dimmer than ${claim.b}`
}

function VerdictIcon({ status }: { status: VerdictStatus }) {
  if (status === 'CONSISTENT') {
    return <CircleCheckBig className="text-ok h-6 w-6 shrink-0" aria-hidden="true" />
  }
  if (status === 'CONTRADICTED') {
    return <CircleX className="text-bad h-6 w-6 shrink-0" aria-hidden="true" />
  }
  return <CircleQuestionMark className="text-unknown h-6 w-6 shrink-0" aria-hidden="true" />
}

/** Checks a preset's claims through POST /api/evaluate and lists verdicts. */
export default function EvaluatePanel({ preset }: { preset: Preset }) {
  const [selected, setSelected] = useState(0)
  const [state, setState] = useState<State>({ phase: 'idle' })
  const requestId = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const option = preset.options[selected] ?? preset.options[0]

  const check = () => {
    const target = preset.options[selected] ?? preset.options[0]
    if (!target) {
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    requestId.current += 1
    const id = requestId.current
    setState({ phase: 'checking' })
    void (async () => {
      try {
        const verdicts: JudgedClaim[] = []
        for (const claim of target.claims) {
          const judged = await evaluateClaim(claim, preset.netlist, next.signal)
          verdicts.push({ label: target.label, text: claimText(claim), verdict: judged.verdict })
        }
        if (requestId.current === id) {
          setState({ phase: 'done', verdicts })
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

  return (
    <section aria-labelledby="evaluate-heading" className="flex flex-col gap-4">
      <h2 id="evaluate-heading" className="text-lg font-semibold">
        Check a prediction
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Predictions">
        {preset.options.map((choice, index) => {
          const active = index === selected
          return (
            <button
              key={choice.label}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(index)}
              className={`border-glass-border flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium text-ink ${
                active ? 'border-flow' : ''
              }`}
            >
              {active && <Check className="text-flow h-4 w-4" aria-hidden="true" />}
              {choice.label}
            </button>
          )
        })}
      </div>
      <div>
        <button
          type="button"
          disabled={state.phase === 'checking' || !option}
          onClick={check}
          className="bg-flow text-on-accent flex min-h-[44px] min-w-40 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.phase === 'checking' ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking…
            </>
          ) : (
            'Check prediction'
          )}
        </button>
      </div>
      {state.phase === 'done' && (
        <div className="flex flex-col gap-3" aria-live="polite">
          {state.verdicts.map((row, index) => (
            <div key={`${row.text}-${index}`} className="glass-panel flex flex-col gap-1 p-4">
              <div className="flex items-center gap-3">
                <VerdictIcon status={row.verdict.status} />
                <div>
                  <p className="text-base font-medium text-ink">{VERDICT_LABELS[row.verdict.status]}</p>
                  <p className="text-ink-muted text-sm">{row.text}</p>
                </div>
              </div>
              {Object.keys(row.verdict.evidence).length > 0 ? (
                <div className="flex flex-col gap-1 pl-9">
                  {Object.entries(row.verdict.evidence).map(([key, power]) => {
                    const [cid] = key.split('.')
                    return (
                      <p key={key} className="text-ink-muted text-sm">
                        <span className="font-mono">{cid}</span>
                        {' · '}
                        <ReadoutValue value={power} unit="W" />
                      </p>
                    )
                  })}
                </div>
              ) : (
                row.verdict.reason && (
                  <p className="pl-9 font-mono text-xs text-ink-muted">{row.verdict.reason}</p>
                )
              )}
            </div>
          ))}
        </div>
      )}
      {state.phase === 'error' && (
        <div className="glass-panel flex items-center gap-3 p-4" role="alert">
          <CircleX className="text-bad h-6 w-6 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-base">{state.message}</p>
          <button
            type="button"
            onClick={check}
            className="border-glass-border min-h-[44px] shrink-0 rounded-[10px] border px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}
      <p className="text-ink-muted text-xs">This tests your prediction against the model, not you.</p>
      {state.phase === 'done' && (
        <details className="text-xs">
          <summary className="text-ink-muted cursor-pointer">Raw JSON</summary>
          <pre className="border-glass-border text-ink-muted mt-2 max-h-48 overflow-auto rounded-[10px] border bg-canvas p-3 font-mono">
            {JSON.stringify(state.verdicts.map((row) => row.verdict), null, 2)}
          </pre>
        </details>
      )}
    </section>
  )
}
