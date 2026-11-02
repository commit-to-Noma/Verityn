import type { ReactNode } from 'react'
import type { SimulateResult } from '../api/client'
import ReadoutValue from './ReadoutValue'

/** Compact solver-grounded result with the rest of the workbench disclosed below. */
export default function GuidedResultCard({
  result,
  children,
  onDetailsOpen,
  coachOff = false,
}: {
  result: SimulateResult
  children: ReactNode
  onDetailsOpen: () => void
  coachOff?: boolean
}) {
  if (!result.ok) {
    return (
      <section className="glass-panel p-4" role="alert" aria-label="Test result">
        <p className="font-medium">The solver did not return measurements for this test.</p>
      </section>
    )
  }

  const battery = Object.entries(result.components).find(([id]) => id.startsWith('B'))?.[1]
  const bulb = result.components.L1

  return (
    <section className="glass-panel flex min-w-0 flex-col gap-4 p-4" aria-label="Test result">
      <div>
        <p className="text-flow text-xs font-semibold uppercase tracking-[0.16em]">
          Measured by the solver
        </p>
        {coachOff && (
          <p className="mt-2 text-sm text-ink-muted">
            <span className="font-semibold text-ink">Coach off.</span> You can reason and test this circuit on your own.
          </p>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {battery !== undefined && (
            <div className="rounded-xl border border-glass-border p-3">
              <p className="text-ink-muted text-xs">Battery voltage</p>
              <p className="mt-1 text-2xl font-semibold">
                <ReadoutValue value={battery.voltage} unit="V" />
              </p>
            </div>
          )}
          {bulb !== undefined && (
            <>
              <div className="rounded-xl border border-glass-border p-3">
                <p className="text-ink-muted text-xs">Bulb current</p>
                <p className="mt-1 text-2xl font-semibold">
                  <ReadoutValue value={bulb.current} unit="A" />
                </p>
              </div>
              <div className="rounded-xl border border-glass-border p-3">
                <p className="text-ink-muted text-xs">Bulb power</p>
                <p className="mt-1 text-2xl font-semibold">
                  <ReadoutValue value={bulb.power} unit="W" />
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      <details
        className="border-t border-glass-border/70 pt-3"
        onToggle={(event) => {
          if (event.currentTarget.open) {
            onDetailsOpen()
          }
        }}
      >
        <summary className="text-flow min-h-[44px] cursor-pointer py-2 text-sm font-medium">
          See details
        </summary>
        <div className="mt-3 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {children}
        </div>
      </details>
    </section>
  )
}
