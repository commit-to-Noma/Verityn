import type { TraceInput } from '../lessons/trace'
import EvidenceTrace from './EvidenceTrace'

export interface ChapterRecap {
  id: string
  title: string
  solo: boolean
  input: TraceInput
}

/** Finale: what the learner accomplished, grounded in saved simulation evidence. */
export default function JourneyFinale({ chapters }: { chapters: ChapterRecap[] }) {
  return (
    <section aria-labelledby="finale-heading" className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-flow">
          Journey complete
        </p>
        <h2 id="finale-heading" className="text-xl font-semibold">
          You proved it solo
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Every step below is observed simulation evidence — your predictions against the model,
          not a grade.
        </p>
      </div>
      {chapters.map((chapter) => (
        <article key={chapter.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{chapter.title}</h3>
            {chapter.solo && (
              <span className="rounded-full border border-glass-border px-3 py-1 text-xs font-medium text-ink">
                Coach off — independent
              </span>
            )}
          </div>
          <EvidenceTrace input={chapter.input} />
        </article>
      ))}
    </section>
  )
}
