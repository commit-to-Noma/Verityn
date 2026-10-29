import type { ReactNode } from 'react'
import type { ShellLocation, Stage } from '../journey/stages'
import { SHELL_NAV, progressIndex } from '../journey/stages'
import HealthStatus from './HealthStatus'
import JourneyProgress from './JourneyProgress'

/** Laboratory frame: brand header, persistent nav, workspace, dev controls. */
export default function JourneyShell({
  stage,
  auto,
  children,
  tools,
  location,
  onNavigate,
  wide = false,
}: {
  stage: Stage
  auto: boolean
  children: ReactNode
  tools: ReactNode
  location: ShellLocation
  onNavigate: (target: ShellLocation) => void
  /** Wide views (homepage, lens, canvas) use the full frame; reading views stay narrow. */
  wide?: boolean
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 pb-12 sm:px-6">
      <header className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-white">
            <img
              src="/brand/verityn-logo.png"
              alt="Verityn logo"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          </span>
          <p className="text-xl font-semibold tracking-tight">Verityn Laboratory</p>
        </div>
        {stage !== 'intro' && <JourneyProgress active={progressIndex(stage)} />}
        {auto && (
          <span className="rounded-full border border-flow/60 px-2.5 py-1 text-[11px] font-medium text-flow">
            Auto-demo
          </span>
        )}
        {stage !== 'intro' && (
          <div className="ml-auto">
            <HealthStatus compact />
          </div>
        )}
      </header>
      <nav aria-label="Laboratory" className="border-glass-border flex flex-wrap items-center gap-2 border-y py-2">
        {SHELL_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled === true}
            aria-current={location === item.id ? 'page' : undefined}
            aria-disabled={item.disabled === true}
            title={item.disabled === true ? 'The next workspace — not built yet.' : undefined}
            onClick={() => {
              if (item.id !== 'experiment') {
                onNavigate(item.id)
              }
            }}
            className={`flex min-h-[44px] items-center gap-2 rounded-[10px] px-4 text-sm font-medium ${
              location === item.id
                ? 'bg-glass-strong text-ink'
                : item.disabled === true
                  ? 'cursor-not-allowed text-ink-muted opacity-60'
                  : 'text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
            {item.badge !== undefined && (
              <span className="border-glass-border rounded-full border px-2 py-0.5 text-[11px]">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <main key={stage} className={`stage-enter flex flex-col ${wide ? 'w-full' : 'mx-auto w-full max-w-3xl'}`}>
        {children}
      </main>
      <footer>
        <details id="lab-tools" className="glass-panel p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Presenter &amp; developer controls
            <span className="ml-2 font-normal text-ink-muted">Auto-demo and API benches.</span>
          </summary>
          <div className="mt-4 flex flex-col gap-8">{tools}</div>
        </details>
      </footer>
    </div>
  )
}
