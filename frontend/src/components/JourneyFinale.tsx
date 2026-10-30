import type { ChapterRecap } from '../journey/story'
import { learningProgress, MISSING_CHAPTER } from '../journey/story'
import { L1 } from '../lessons/l1'
import { netlistPreviewSeed } from '../canvas/netlistPreview'
import CircuitPreview from './CircuitPreview'
import EvidenceTrace from './EvidenceTrace'
import JourneyStory from './JourneyStory'

/** Finale: show the verified circuit first, with detailed evidence on demand. */
export default function JourneyFinale({
  chapters,
  onTryLab,
  onReplayDemo,
  onReturnHub,
  onExploreLens,
}: {
  chapters: ChapterRecap[]
  onTryLab: () => void
  onReplayDemo: () => void
  onReturnHub: () => void
  onExploreLens: () => void
}) {
  const transfer = chapters.find((chapter) => chapter.solo)?.input
  const previewSeed =
    transfer?.netlist === null || transfer?.netlist === undefined
      ? null
      : netlistPreviewSeed(transfer.netlist)
  const verifiedTransfer =
    transfer?.result?.ok === true &&
    transfer.verdict?.status === 'CONSISTENT' &&
    previewSeed !== null
  const progress = learningProgress(chapters)
  const completedSteps = progress.filter((step) => step.complete).length
  const progressPercent = Math.round((completedSteps / progress.length) * 100)
  return (
    <section aria-labelledby="finale-heading" className="flex flex-col gap-5">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-flow">
          Journey complete
        </p>
        <h2 id="finale-heading" className="text-2xl font-semibold">
          {verifiedTransfer ? 'Your solo prediction matched' : 'Your solo test is complete'}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Review what you predicted, what this circuit measured, and what you tried independently.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <article className="glass-panel flex min-w-0 flex-col gap-3 p-4">
          <div>
            <h3 className="font-semibold">See what changed</h3>
            <p className="text-ink-muted mt-1 text-sm">
              Compare the first open gap with the circuit you built independently.
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <section className="min-w-0" aria-label="Starting circuit">
              <h4 className="mb-1 text-sm font-semibold">Start · open gap</h4>
              <p className="mb-2 text-xs text-ink-muted">One bulb, with a loose terminal.</p>
              <CircuitPreview
                seed={L1.seed}
                label="Starting circuit with one bulb and an open gap"
                className="h-[190px] sm:h-[230px]"
              />
            </section>
            <section className="min-w-0" aria-label="Independent solo circuit">
              <h4 className="mb-1 text-sm font-semibold">Your solo test · complete loop</h4>
              <p className="mb-2 text-xs text-ink-muted">
                {verifiedTransfer
                  ? 'Your tested two-bulb circuit, with the coach off.'
                  : 'Available after a verified solo run.'}
              </p>
              {verifiedTransfer ? (
                <CircuitPreview
                  seed={previewSeed}
                  label="Reconstructed solo circuit from the tested wiring"
                  result={transfer.result}
                  className="h-[190px] sm:h-[230px]"
                />
              ) : (
                <div
                  aria-label="Verified solo circuit unavailable"
                  className="canvas-grid flex h-[190px] items-center justify-center rounded-2xl border border-glass-border p-6 text-center text-sm text-ink-muted sm:h-[230px]"
                >
                  {MISSING_CHAPTER}
                </div>
              )}
            </section>
          </div>
          {verifiedTransfer && transfer?.result !== null && transfer?.result !== undefined && (
            <div className="flex flex-wrap gap-2" aria-label="Final circuit measurements">
              {Object.entries(transfer.result.components)
                .filter(([id]) => id.startsWith('L'))
                .map(([id, reading]) => (
                  <span
                    key={id}
                    className="rounded-full border border-ok/50 px-3 py-1 text-xs font-medium text-ink"
                  >
                    {id}: {reading.current.toFixed(1)} A · {reading.power.toFixed(1)} W
                  </span>
                ))}
            </div>
          )}
          <p className="rounded-xl border border-flow/30 bg-flow/5 p-3 text-sm text-ink">
            Reflection: Which connection brought the second bulb into the complete path, and what readings support your conclusion?
          </p>
          {verifiedTransfer && (
            <p className="text-ink-muted text-xs">
              Circuit layout is rearranged for readability. The solo diagram’s parts and connections come from your tested run.
            </p>
          )}
        </article>
        <div className="flex min-w-0 flex-col gap-3">
          <section aria-label="Progress you demonstrated" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Progress you demonstrated</h3>
              <span className="text-ink-muted text-xs">
                {completedSteps} of {progress.length} circuits tested
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Circuits tested"
              aria-valuemin={0}
              aria-valuemax={progress.length}
              aria-valuenow={completedSteps}
              className="h-2 overflow-hidden rounded-full bg-glass-strong"
            >
              <div
                className="h-full rounded-full bg-flow transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <ol className="flex flex-col gap-2">
              {progress.map((step, index) => (
                <li key={step.title} className="glass-panel p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-sm font-semibold">
                      <span className="text-flow mr-1.5">{String(index + 1).padStart(2, '0')}</span>
                      {step.title}
                    </h4>
                    <span className="text-ink-muted shrink-0 text-[11px]">
                      {step.complete ? 'Evidence captured' : 'Not reached'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{step.evidence}</p>
                  <p className="text-ink-muted mt-1 text-sm">{step.learning}</p>
                </li>
              ))}
            </ol>
          </section>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onTryLab}
              className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
            >
              Start a new guided run
            </button>
            <button
              type="button"
              onClick={onReplayDemo}
              className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
            >
              Replay guided demo
            </button>
            <button
              type="button"
              onClick={onExploreLens}
              className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
            >
              Open Reality Lens
            </button>
            <button
              type="button"
              onClick={onReturnHub}
              className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
            >
              Return to Laboratory
            </button>
          </div>
        </div>
      </div>
      <details className="glass-panel p-4">
        <summary className="min-h-[44px] cursor-pointer content-center text-sm font-medium">
          See the full journey and measurements
        </summary>
        <div className="mt-4 flex flex-col gap-5">
          <JourneyStory chapters={chapters} />
          {chapters.map((chapter) => (
            <article key={chapter.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">{chapter.title}</h3>
                {chapter.solo && (
                  <span className="rounded-full border border-glass-border px-3 py-1 text-xs font-medium text-ink">
                    Coach off · independent
                  </span>
                )}
              </div>
              {chapter.input === null ? (
                <p className="text-ink-muted text-sm">{MISSING_CHAPTER}</p>
              ) : (
                <EvidenceTrace input={chapter.input} />
              )}
            </article>
          ))}
        </div>
      </details>
    </section>
  )
}
