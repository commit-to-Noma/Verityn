import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ShellLocation, Stage } from '../journey/stages'
import { SHELL_NAV, progressIndex } from '../journey/stages'
import HealthStatus from './HealthStatus'
import JourneyProgress from './JourneyProgress'
import ProofSwitch from './ProofSwitch'
import TracePanel from './TracePanel'
import { useProofMode } from '../proof/store'
import { META_EVIDENCE_BASE } from '../content/intelligence'

/** Laboratory frame: brand header, persistent nav, workspace, dev controls. */
export default function JourneyShell({
  stage,
  auto,
  children,
  tools,
  location,
  onNavigate,
  demoBar,
  demoActive = false,
  notice,
  wide = false,
}: {
  stage: Stage
  auto: boolean
  children: ReactNode
  tools: ReactNode
  location: ShellLocation
  onNavigate: (target: ShellLocation) => void
  /** Guided-demo controls; rendered in the shell, never in dev tools. */
  demoBar?: ReactNode
  /** While demo controls are sticky, let the brand header scroll out of the way. */
  demoActive?: boolean
  /** Important recovery or workspace status shown above the current stage. */
  notice?: ReactNode
  /** Wide views (homepage, lens, canvas) use the full frame; reading views stay narrow. */
  wide?: boolean
}) {
  const mobileMenu = useRef<HTMLDetailsElement>(null)
  const rowNav = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const proof = useProofMode()

  /** Lava-lamp trail: one pill follows the active tab's measured rect. */
  useLayoutEffect(() => {
    const measure = () => {
      const nav = rowNav.current
      const active =
        nav?.querySelector<HTMLElement>(':scope > [aria-current="page"]') ??
        nav?.querySelector<HTMLElement>('[aria-current="page"]')
      if (nav === null || nav === undefined || active === null || active === undefined) {
        setPill(null)
        return
      }
      const frame = nav.getBoundingClientRect()
      const box = active.getBoundingClientRect()
      if (box.width === 0) {
        setPill(null)
        return
      }
      setPill({ left: box.left - frame.left, width: box.width })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [location])
  const renderNavButton = (item: (typeof SHELL_NAV)[number]) => (
    <button
      key={item.id}
      type="button"
      disabled={item.disabled === true}
      aria-current={item.primary && location === item.destination ? 'page' : undefined}
      aria-disabled={item.disabled === true}
      title={item.disabled === true ? 'The next workspace  -  not built yet.' : undefined}
      onClick={() => {
        mobileMenu.current?.removeAttribute('open')
        onNavigate(item.destination)
      }}
      className={`relative z-10 flex min-h-[44px] items-center gap-2 rounded-[10px] px-4 text-sm font-medium ${
        item.primary && location === item.destination
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
  )

  /** Primary tabs only: the Under-the-hood section lives on the Hub page,
   * and its shortcuts only duplicated lab/experiment destinations. */
  const renderNavigationItems = () => (
    <>
      {SHELL_NAV.filter((item) => item.primary).map(renderNavButton)}
    </>
  )

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 pb-12 sm:px-6">
      <header
        className={`${demoActive ? '' : 'sticky top-0 z-50'} w-screen max-w-[100vw] border-y border-glass-border bg-[rgb(10_14_28/0.82)] shadow-[0_10px_28px_rgb(10_14_28/0.22)] backdrop-blur-xl`}
        style={{ marginInline: 'calc(50% - 50vw)' }}
      >
        <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => onNavigate('hub')}
            aria-label="Verityn home"
            className="flex min-w-0 items-center gap-3 rounded-[10px]"
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] border border-flow/30 bg-flow/10 shadow-[0_0_18px_rgb(56_214_233/0.16)]">
              <img
                src="/brand/verityn-logo-transparent.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
              />
            </span>
            <span className="text-xl font-semibold tracking-tight">Verityn Laboratory</span>
          </button>
          <details ref={mobileMenu} className="relative ml-auto xl:hidden">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center rounded-[10px] border border-glass-border px-4 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
              Pages
            </summary>
            <nav
              aria-label="Laboratory pages"
              className="absolute right-0 top-full z-[60] mt-2 flex w-64 flex-col rounded-xl border border-glass-border bg-[rgb(10_14_28/0.98)] p-2 shadow-xl"
            >
              {renderNavigationItems()}
            </nav>
          </details>
          <nav
            ref={rowNav}
            aria-label="Laboratory"
            className="relative hidden items-center gap-1 rounded-xl border border-glass-border bg-gray-900/60 p-1.5 backdrop-blur-md xl:ml-auto xl:flex"
          >
            {pill !== null && (
              <div
                aria-hidden="true"
                className="absolute top-[6px] bottom-[6px] rounded-lg border border-flow/40 bg-gradient-to-r from-flow/20 to-light/20 shadow-[0_0_15px_rgb(6_182_212/0.15)] transition-all duration-500 ease-out motion-reduce:transition-none"
                style={{ left: pill.left - 3, width: pill.width + 6 }}
              />
            )}
            {renderNavigationItems()}
          </nav>
          <div className="xl:ml-2">
            <ProofSwitch />
          </div>
          {(stage !== 'intro' || auto) && (
            <div className="flex w-full flex-wrap items-center gap-2 border-t border-glass-border/70 pt-2">
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
            </div>
          )}
        </div>
      </header>
      {demoBar}
      <main key={stage} className={`stage-enter flex flex-col ${wide ? 'w-full' : 'mx-auto w-full max-w-3xl'}`}>
        {notice}
        {children}
      </main>
      <footer className="flex flex-col gap-4">
        {location === 'hub' && (
        <section aria-labelledby="built-with-meta-heading" className="glass-panel p-4">
          <h2 id="built-with-meta-heading" className="text-sm font-semibold">Built with Meta</h2>
          <ul className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <li>
              <span className="font-medium">Muse Spark</span>
              <span className="text-ink-muted"> — R1 conceptual questions and drafted text explanations. </span>
              <a
                className="text-flow underline underline-offset-2"
                href={`${META_EVIDENCE_BASE}docs/INTELLIGENCE_LOG.md`}
                target="_blank"
                rel="noreferrer"
              >
                Trace and validation notes
              </a>
            </li>
            <li>
              <span className="font-medium">Muse Voice Transcribe</span>
              <span className="text-ink-muted"> — 5-second audio recordings into editable text. </span>
              <a
                className="text-flow underline underline-offset-2"
                href={`${META_EVIDENCE_BASE}docs/ARCHITECTURE.md`}
                target="_blank"
                rel="noreferrer"
              >
                Voice integration notes
              </a>
            </li>
            <li>
              <span className="font-medium">SAM</span>
              <span className="text-ink-muted"> — sample only; no live SAM inference is used. Tappable segmentation samples utilize saved provenance. </span>
              <a
                className="text-flow underline underline-offset-2"
                href={`${META_EVIDENCE_BASE}docs/sam-spike-results.json`}
                target="_blank"
                rel="noreferrer"
              >
                Sample probe results
              </a>
            </li>
          </ul>
        </section>
        )}
        {proof && <TracePanel />}
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
