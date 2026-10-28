import { providerBadge } from '../api/client'
import { CHOICE_LABELS, LIT_POWER_W } from '../lessons/lesson'
import type { TraceInput } from '../lessons/trace'
import { formatReading } from '../components/format'

export interface ChapterRecap {
  id: string
  title: string
  solo: boolean
  input: TraceInput
}

export interface StoryNode {
  title: string
  detail: string
}

function choiceDetail(chapter: ChapterRecap | undefined): string {
  const prediction = chapter?.input.prediction
  if (!prediction) {
    return 'Not reached'
  }
  const label = CHOICE_LABELS[prediction.choice]
  const why = prediction.why.trim()
  if (why === '') {
    return `Predicted “${label}”`
  }
  const short = why.length > 48 ? `${why.slice(0, 47)}…` : why
  return `Predicted “${label}” — “${short}”`
}

function twistDetail(chapter: ChapterRecap | undefined): string {
  const verdict = chapter?.input.verdict
  if (!verdict) {
    return 'No verdict recorded'
  }
  const [first] = Object.entries(verdict.evidence)
  const observed =
    first === undefined
      ? ''
      : `: ${first[0].split('.')[0]} ${first[1] > LIT_POWER_W ? 'lit' : 'dark'} at ${formatReading(first[1])} W`
  switch (verdict.status) {
    case 'CONTRADICTED':
      return `Model disagreed${observed}`
    case 'CONSISTENT':
      return `Prediction held${observed}`
    case 'UNASSESSABLE':
      return "Couldn't assess"
  }
}

function coachDetail(chapter: ChapterRecap | undefined): string {
  const coach = chapter?.input.coach
  if (!coach || coach.phase !== 'done') {
    return 'No coaching'
  }
  return `One guiding question (${providerBadge(coach.provider)})`
}

function transferDetail(chapter: ChapterRecap | undefined): string {
  const input = chapter?.input
  if (!input?.verdict) {
    return 'No verdict recorded'
  }
  const bulbs =
    input.netlist?.components.filter((component) => component.type === 'bulb') ?? []
  const lit = bulbs.filter(
    (bulb) => (input.result?.components[bulb.id]?.power ?? 0) > LIT_POWER_W,
  ).length
  if (input.verdict.status !== 'CONSISTENT') {
    return `${input.verdict.status === 'CONTRADICTED' ? 'Contradicted' : "Couldn't assess"} — see trace`
  }
  return lit === 1 ? 'Verified: 1 bulb lit' : `Verified: ${lit} bulbs lit`
}

/** Five-beat story of the journey, derived from saved chapter evidence. */
export function storyNodes(chapters: ChapterRecap[]): StoryNode[] {
  const [l1, twist, transfer] = chapters
  return [
    { title: 'First belief', detail: choiceDetail(l1) },
    { title: 'Twist evidence', detail: twistDetail(twist) },
    { title: 'Coach question', detail: coachDetail(twist) },
    { title: 'Solo prediction', detail: choiceDetail(transfer) },
    { title: 'Verified transfer', detail: transferDetail(transfer) },
  ]
}
