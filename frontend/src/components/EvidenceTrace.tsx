import { providerBadge } from '../api/client'
import type { TraceBody, TraceInput } from '../lessons/trace'
import { buildTrace } from '../lessons/trace'
import ReadoutValue from './ReadoutValue'
import { VerdictIcon } from './verdict'
import { VERDICT_LABELS } from './verdictLabels'

/** Renders one trace step body; all content is derived in trace.ts. */
function StepBody({ body }: { body: TraceBody }) {
  switch (body.kind) {
    case 'empty':
      return <p className="text-ink-muted text-sm">{body.text}</p>
    case 'prediction':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-ink-muted text-sm">{body.question}</p>
          <p className="text-base">
            <span className="font-medium">{body.choiceLabel}</span>
            {body.why === null ? (
              <span className="text-ink-muted"> — no reason given</span>
            ) : (
              <span className="text-ink-muted"> — “{body.why}”</span>
            )}
          </p>
        </div>
      )
    case 'circuit':
      return (
        <ul className="flex flex-col gap-1">
          {body.rows.map((row) => (
            <li key={row.id} className="flex items-baseline gap-2 text-sm">
              <span className="font-mono font-medium">{row.id}</span>
              <span className="text-ink-muted">{row.kind}</span>
              <span className="text-ink-muted ml-auto text-right">{row.detail}</span>
            </li>
          ))}
        </ul>
      )
    case 'solver':
      if (!body.summary.ok) {
        return (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              <span className="font-mono">{body.summary.code}</span>
              <span className="text-ink-muted"> — {body.summary.message}</span>
            </p>
            {body.summary.offenders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {body.summary.offenders.map((id) => (
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
        )
      }
      if (body.summary.lit.length === 0 && body.summary.darkBulbs.length === 0) {
        return <p className="text-ink-muted text-sm">Solved — no bulbs in this circuit.</p>
      }
      return (
        <ul className="flex flex-col gap-1">
          {body.summary.lit.map((bulb) => (
            <li key={bulb.id} className="flex items-baseline gap-2 text-sm">
              <span className="font-mono font-medium">{bulb.id}</span>
              <span className="text-ink-muted ml-auto">
                <ReadoutValue value={bulb.current} unit="A" />
                {' · '}
                <ReadoutValue value={bulb.power} unit="W" />
                {' · lit'}
              </span>
            </li>
          ))}
          {body.summary.darkBulbs.map((id) => (
            <li key={id} className="flex items-baseline gap-2 text-sm">
              <span className="font-mono font-medium">{id}</span>
              <span className="text-ink-muted ml-auto">dark</span>
            </li>
          ))}
        </ul>
      )
    case 'comparison':
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <VerdictIcon status={body.status} />
            <p className="text-base font-medium text-ink">{VERDICT_LABELS[body.status]}</p>
          </div>
          {body.evidence.map((row) => (
            <p key={row.id} className="text-ink-muted pl-9 text-sm">
              <span className="font-mono">{row.id}</span>
              {' · '}
              <ReadoutValue value={row.watts} unit="W" />
            </p>
          ))}
          <p className="text-ink-muted pl-9 text-xs">{body.note}</p>
        </div>
      )
    case 'coach':
      if (body.outcome === null) {
        return <p className="text-ink-muted text-sm">{body.hint}</p>
      }
      if (body.outcome.phase === 'unavailable') {
        return <p className="text-ink-muted text-sm">{body.outcome.message}</p>
      }
      return (
        <div className="flex flex-col gap-2">
          <span className="border-glass-border w-fit rounded-full border px-3 py-1 text-xs font-medium text-ink">
            {providerBadge(body.outcome.provider)}
          </span>
          <p className="text-base">{body.outcome.text}</p>
          {body.outcome.learnerReply !== undefined && body.outcome.learnerReply !== '' && (
            <p className="text-ink-muted text-sm">
              <span className="font-medium text-ink">Your thought:</span> {body.outcome.learnerReply}
            </p>
          )}
          <p className="text-ink-muted text-xs">
            A prompt to reconsider — not a diagnosis of what you think.
          </p>
        </div>
      )
  }
}

/** Timeline of the learning journey, built from existing evidence only. */
export default function EvidenceTrace({ input }: { input: TraceInput }) {
  const steps = buildTrace(input)
  return (
    <section aria-label="Evidence trace" aria-live="polite" className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Evidence trace</h3>
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step.id} className="glass-panel flex gap-3 p-4">
            <span
              className="border-glass-border text-ink-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-flow text-xs font-semibold uppercase tracking-[0.18em]">{step.title}</p>
              <StepBody body={step.body} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
