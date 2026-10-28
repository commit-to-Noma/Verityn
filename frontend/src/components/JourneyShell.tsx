import type { ReactNode } from 'react'
import type { Stage } from '../journey/stages'
import { progressIndex } from '../journey/stages'
import HealthStatus from './HealthStatus'
import JourneyProgress from './JourneyProgress'

/** Guided-journey frame: header progress, one stage at a time, tools tucked away. */
export default function JourneyShell({
  stage,
  auto,
  children,
  tools,
}: {
  stage: Stage
  auto: boolean
  children: ReactNode
  tools: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 pb-12">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 py-2">
        <p className="text-xl font-semibold tracking-tight">Verityn</p>
        {stage !== 'intro' && <JourneyProgress active={progressIndex(stage)} />}
        {auto && (
          <span className="rounded-full border border-flow/60 px-2.5 py-1 text-[11px] font-medium text-flow">
            Auto-demo
          </span>
        )}
        <div className="ml-auto">
          <HealthStatus compact />
        </div>
      </header>
      <main key={stage} className="stage-enter flex flex-col">
        {children}
      </main>
      <footer>
        <details id="lab-tools" className="glass-panel p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Tools
            <span className="ml-2 font-normal text-ink-muted">
              Optional extras — outside the learning flow.
            </span>
          </summary>
          <div className="mt-4 flex flex-col gap-8">{tools}</div>
        </details>
      </footer>
    </div>
  )
}
