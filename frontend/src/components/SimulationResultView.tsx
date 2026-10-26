import { CircleX } from 'lucide-react'
import type { SimulateResult } from '../api/client'
import ReadoutValue from './ReadoutValue'

/** Measurements for a solved circuit, or the invalid banner with offender ids. */
export default function SimulationResultView({ result }: { result: SimulateResult }) {
  return (
    <>
      {result.ok ? (
        <div className="glass-panel flex flex-col gap-2 p-4" aria-live="polite">
          {Object.entries(result.components).map(([id, values]) => (
            <div key={id} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-medium">{id}</span>
              <span className="text-ink-muted text-right text-sm">
                <ReadoutValue value={values.voltage} unit="V" />
                {' · '}
                <ReadoutValue value={values.current} unit="A" />
                {' · '}
                <ReadoutValue value={values.power} unit="W" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-panel flex flex-col gap-2 p-4" role="alert">
          <div className="flex items-center gap-3">
            <CircleX className="text-bad h-6 w-6 shrink-0" aria-hidden="true" />
            <p className="text-base font-medium">{result.error_message}</p>
          </div>
          {result.component_ids.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-9">
              {result.component_ids.map((id) => (
                <span
                  key={id}
                  className="border-glass-border rounded-full border px-3 py-1 font-mono text-xs text-ink"
                >
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <details className="text-xs">
        <summary className="text-ink-muted cursor-pointer">Raw JSON</summary>
        <pre className="border-glass-border text-ink-muted mt-2 max-h-48 overflow-auto rounded-[10px] border bg-canvas p-3 font-mono">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </>
  )
}
