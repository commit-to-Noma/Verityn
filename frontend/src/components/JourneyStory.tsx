import type { ChapterRecap } from '../journey/story'
import { storyNodes } from '../journey/story'

/** Responsive story grid plus honest closing copy for the finale. */
export default function JourneyStory({ chapters }: { chapters: ChapterRecap[] }) {
  const nodes = storyNodes(chapters)
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
        These notes keep your choices beside what the solver measured.
      </p>
    </div>
  )
}
