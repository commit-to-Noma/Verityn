import type { ChapterRecap } from '../journey/story'
import { MISSING_CHAPTER, evidenceCards, finaleNarrative } from '../journey/story'
import EvidenceTrace from './EvidenceTrace'
import JourneyStory from './JourneyStory'

/** Finale: what the learner thought, tested, and learned  -  evidence first,
 * capstone after, and no dead end. */
export default function JourneyFinale({
  chapters,
  onTryLab,
  onReturnHub,
  onExploreLens,
}: {
  chapters: ChapterRecap[]
  onTryLab: () => void
  onReturnHub: () => void
  onExploreLens: () => void
}) {
  const narrative = finaleNarrative(chapters)
  return (
    <section aria-labelledby="finale-heading" className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-flow">
          Journey complete
        </p>
        <h2 id="finale-heading" className="text-xl font-semibold">
          You proved it solo
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Evidence summary">
        {evidenceCards(chapters).map((card) => (
          <div key={card.title} className="glass-panel p-4">
            <p className="text-flow text-xs font-semibold uppercase tracking-[0.14em]">
              {card.title}
            </p>
            <p className="mt-2 text-base">{card.detail}</p>
          </div>
        ))}
      </div>
      {narrative.length > 0 && (
        <div className="glass-panel flex flex-col gap-2 p-4">
          {narrative.map((line) => (
            <p key={line} className="text-base">
              {line}
            </p>
          ))}
        </div>
      )}
      <div>
        <p className="text-base font-medium">
          You did not memorize the answer. You tested it, explained it, and proved it.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Every step below is observed simulation evidence  -  what you predicted and what the
          simulator measured, not a grade.
        </p>
      </div>
      <JourneyStory chapters={chapters} />
      <details className="glass-panel p-4">
        <summary className="min-h-[44px] cursor-pointer content-center text-sm font-medium">
          How the system works
        </summary>
        <ul className="text-ink-muted mt-2 flex flex-col gap-1 text-sm">
          <li>Meta Muse Spark  -  asks coaching questions and proposes diagram interpretations.</li>
          <li>Reality Lens  -  turns a diagram into a circuit proposal you review.</li>
          <li>Verityn Solver  -  calculates current, power, validity, and verdicts.</li>
          <li>Verityn  -  runs the learning journey and records the evidence.</li>
        </ul>
      </details>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTryLab}
          className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
        >
          Try another guided lab
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Replay journey
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
      {chapters.map((chapter) => (
        <article key={chapter.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{chapter.title}</h3>
            {chapter.solo && (
              <span className="rounded-full border border-glass-border px-3 py-1 text-xs font-medium text-ink">
                Coach off  -  independent
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
    </section>
  )
}
