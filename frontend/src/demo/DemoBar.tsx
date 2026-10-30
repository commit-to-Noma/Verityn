import type { DemoState } from './machine'
import { demoBeatLabel, demoStatusLabel, demoStepLabel } from './machine'

/** Visible guided-demo controls. Rendered in the shell, never in dev tools. */
export default function DemoBar({
  demo,
  onPause,
  onResume,
  onSkip,
  onReplay,
  onManual,
  onExit,
}: {
  demo: DemoState
  onPause: () => void
  onResume: () => void
  onSkip: () => void
  onReplay: () => void
  onManual: () => void
  onExit: () => void
}) {
  if (!demo.active) {
    return null
  }
  const status = demoStatusLabel(demo)
  return (
    <div
      aria-label="Guided demo controls"
      className="glass-panel sticky top-0 z-[60] flex flex-wrap items-center gap-x-4 gap-y-2 border border-glass-border bg-[rgb(20_25_42/0.96)] p-3 shadow-xl backdrop-blur-xl"
    >
      <p className="text-sm font-medium" role="status" aria-live="polite">
        {status} · {demoBeatLabel(demo.beat)}
      </p>
      <p className="text-ink-muted text-sm">{demoStepLabel(demo)}</p>
      {demo.paused && !demo.complete && (
        <p className="text-ink-muted text-sm">Resume when ready.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!demo.complete && demo.paused && (
          <button
            type="button"
            onClick={onResume}
            className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
          >
            Resume demo
          </button>
        )}
        {!demo.complete && !demo.paused && (
          <button
            type="button"
            onClick={onPause}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Pause demo
          </button>
        )}
        {!demo.complete && (
          <button
            type="button"
            onClick={onSkip}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Skip to next beat
          </button>
        )}
        <button
          type="button"
          onClick={onReplay}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Replay demo
        </button>
        <button
          type="button"
          onClick={onManual}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Try it yourself
        </button>
        <button
          type="button"
          onClick={onExit}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Exit demo
        </button>
      </div>
    </div>
  )
}
