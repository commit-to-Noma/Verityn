import { ArrowRight, FlaskConical, Play, ScanLine } from 'lucide-react'
import HealthStatus from './HealthStatus'
import ReadoutValue from './ReadoutValue'
import { L1 } from '../lessons/l1'
import { HOMEPAGE_ENTRIES, HOMEPAGE_HEADLINE, HOMEPAGE_SUBHEAD } from '../content/homepage'

const CAPABILITIES = [
  {
    title: 'Guided labs',
    doing: 'Predict, build, and check each step against measured evidence.',
  },
  {
    title: 'Open experiments',
    doing: 'The next workspace: free-form circuits without a script. Not built yet.',
    badge: 'Next',
  },
  {
    title: 'Reality Lens',
    doing: 'Turn a real diagram into a circuit you can review and test.',
  },
  {
    title: 'Independent transfer',
    doing: 'Prove the idea on a fresh circuit with the coach off.',
  },
] as const

const DIAGRAM_EXAMPLE = [
  { step: 'Diagram', doing: 'A real schematic or photo.' },
  { step: 'Meta interpretation', doing: 'Components, terminals, and wires proposed.' },
  { step: 'Editable circuit', doing: 'You review and correct the model.' },
  { step: 'Solver evidence', doing: 'Current, power, and verdict measured.' },
] as const

const STACK = [
  { name: 'Meta Muse Spark', doing: 'Asks questions and guides safe demonstrations.' },
  { name: 'Reality Lens', doing: 'Interprets diagrams and proposes editable models.' },
  { name: 'Verityn Solver', doing: 'Calculates current, power, validity, and verdict.' },
] as const

/** Homepage: laboratory hero, live example, capabilities, honest credits. */
export default function LabIntro({
  onEnter,
  onExploreLens,
  onDemo,
}: {
  onEnter: () => void
  onExploreLens: () => void
  onDemo: () => void
}) {
  return (
    <section aria-labelledby="intro-heading" className="intro-ambient -m-4 flex flex-col items-center gap-10 px-4 py-16 sm:-m-6 sm:py-20">
      <div className="grid w-full items-center gap-8 text-left lg:grid-cols-2">
        <div className="flex flex-col items-start gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-flow">
            Verityn Laboratory
          </p>
          <h2 id="intro-heading" className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
            {HOMEPAGE_HEADLINE}
          </h2>
          <p className="max-w-md text-base text-ink-muted">{HOMEPAGE_SUBHEAD}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onEnter}
              className="bg-flow text-on-accent flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] px-8 text-base font-semibold"
            >
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
              {HOMEPAGE_ENTRIES.guidedLab}
            </button>
            <button
              type="button"
              onClick={onExploreLens}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] border border-glass-border px-8 text-base font-semibold"
            >
              <ScanLine className="h-5 w-5" aria-hidden="true" />
              {HOMEPAGE_ENTRIES.realityLens}
            </button>
          </div>
          <button
            type="button"
            onClick={onDemo}
            className="text-ink-muted flex min-h-[44px] items-center gap-2 text-sm underline-offset-4 hover:text-ink hover:underline"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {HOMEPAGE_ENTRIES.demo}
          </button>
        </div>
        <button
          type="button"
          onClick={onEnter}
          aria-label="Engineering Lab 01, Circuit Reality Check. Open this lab."
          className="glass-panel group flex w-full flex-col gap-3 p-5 text-left"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">
              Engineering Lab 01
            </p>
            <span className="ml-auto rounded-full border border-ok/60 px-2.5 py-1 text-[11px] font-medium text-ok">
              Live example
            </span>
          </div>
          <p className="text-lg font-semibold">Circuit Reality Check</p>
          <svg
            viewBox="0 0 320 120"
            role="img"
            aria-label="Schematic preview: a battery, switch, and bulb wired in one loop."
            className="h-28 w-full"
          >
            <rect x="8" y="8" width="304" height="104" rx="12" className="fill-glass" aria-hidden="true" />
            <path
              d="M40 84 H120 M200 84 H280 M40 84 V36 H100 M220 36 H280 V84"
              fill="none"
              strokeWidth="2.5"
              className="stroke-flow"
              aria-hidden="true"
            />
            <g aria-hidden="true">
              <rect x="100" y="28" width="20" height="16" rx="2" className="fill-light" />
              <rect x="124" y="28" width="8" height="16" rx="2" className="fill-ink-muted" />
              <text x="110" y="60" textAnchor="middle" fontSize="9" className="fill-ink-muted">
                6 V
              </text>
              <line x1="150" y1="36" x2="178" y2="28" strokeWidth="2.5" className="stroke-ink" />
              <circle cx="150" cy="36" r="3" className="fill-ink" />
              <circle cx="182" cy="28" r="3" className="fill-ink" />
              <text x="166" y="60" textAnchor="middle" fontSize="9" className="fill-ink-muted">
                switch
              </text>
              <circle cx="160" cy="84" r="12" fill="none" strokeWidth="2.5" className="stroke-light" />
              <text x="160" y="110" textAnchor="middle" fontSize="9" className="fill-ink-muted">
                bulb L1
              </text>
              <text x="40" y="100" fontSize="9" className="fill-ink-muted">
                B1
              </text>
            </g>
          </svg>
          <p className="text-sm text-ink-muted">
            Verified example — the fixed loop measures{' '}
            <ReadoutValue value={L1.expectedFixed.current} unit="A" /> ·{' '}
            <ReadoutValue value={L1.expectedFixed.power} unit="W" />.
          </p>
          <span className="text-sm font-medium text-flow">
            Open this lab <span aria-hidden="true">→</span>
          </span>
        </button>
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-3">
        <h3 className="text-center text-base font-semibold">What Verityn can do</h3>
        <ul className="grid gap-2 text-left sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((item) => (
            <li key={item.title} className="glass-panel flex flex-col gap-1 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {item.title}
                {'badge' in item && (
                  <span className="border-glass-border text-ink-muted rounded-full border px-2 py-0.5 text-[11px]">
                    {item.badge}
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-muted">{item.doing}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-3">
        <h3 className="text-center text-base font-semibold">
          One example: bringing a circuit diagram to life
        </h3>
        <ol aria-label="How a diagram becomes an experiment" className="grid gap-2 text-left sm:grid-cols-4">
          {DIAGRAM_EXAMPLE.map((item, index) => (
            <li key={item.step} className="glass-panel relative flex flex-col gap-1 p-3">
              <p className="text-sm font-semibold">{item.step}</p>
              <p className="text-xs text-ink-muted">{item.doing}</p>
              {index < DIAGRAM_EXAMPLE.length - 1 && (
                <ArrowRight
                  className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-flow sm:block"
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-2 text-left">
        <h3 className="text-center text-sm font-semibold">What does what</h3>
        <ul className="grid gap-2 sm:grid-cols-3">
          {STACK.map((item) => (
            <li key={item.name} className="glass-panel flex flex-col gap-1 p-3">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-ink-muted">{item.doing}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="max-w-2xl text-center text-xs text-ink-muted">
        Active demo: Physics. Planned next: Biology · Chemistry · Engineering Systems.
      </p>
      <p className="max-w-sm text-center text-xs text-ink-muted">
        The AI asks the question. The simulator supplies the evidence. You make the meaning.
      </p>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <HealthStatus compact />
      </div>
    </section>
  )
}
