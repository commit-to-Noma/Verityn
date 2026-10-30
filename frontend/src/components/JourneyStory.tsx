import type { ChapterRecap } from '../journey/story'
import { storyNodes } from '../journey/story'

/** Responsive story grid plus honest closing copy for the finale. */
export default function JourneyStory({ chapters }: { chapters: ChapterRecap[] }) {
  const nodes = storyNodes(chapters)
  const beganWithMisconception = chapters[0]?.input?.prediction?.choice === 'yes'
  return (
    <div className="flex flex-col gap-3">
      <ol
        aria-label="Journey story"
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {nodes.map((node) => (
          <li key={node.title} className="flex items-stretch gap-2">
            <div className="glass-panel h-full p-3">
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
