import type { ChapterRecap } from '../journey/story'
import { storyNodes } from '../journey/story'

/** Horizontal story strip plus honest closing copy for the finale. */
export default function JourneyStory({ chapters }: { chapters: ChapterRecap[] }) {
  const nodes = storyNodes(chapters)
  const beganWithMisconception = chapters[0]?.input.prediction?.choice === 'yes'
  return (
    <div className="flex flex-col gap-3">
      <ol
        aria-label="Journey story"
        className="flex items-stretch gap-2 overflow-x-auto pb-1"
      >
        {nodes.map((node, index) => (
          <li key={node.title} className="flex items-stretch gap-2">
            {index > 0 && (
              <span className="text-ink-muted self-center" aria-hidden="true">
                →
              </span>
            )}
            <div className="glass-panel w-40 shrink-0 p-3">
              <p className="text-flow text-[11px] font-semibold uppercase tracking-[0.14em]">
                {node.title}
              </p>
              <p className="mt-1 text-sm">{node.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted text-sm">
        {beganWithMisconception
          ? 'You began by trusting the appearance of the circuit. You finished by reasoning from current, power, and loop topology.'
          : 'You predicted carefully, tested every idea against the simulator, and proved the last one solo.'}
      </p>
    </div>
  )
}
