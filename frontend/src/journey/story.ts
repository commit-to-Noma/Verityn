import { providerBadge } from '../api/client'
import { CHOICE_LABELS, LIT_POWER_W } from '../lessons/lesson'
import type { TraceInput } from '../lessons/trace'
import { formatReading } from '../components/format'

export interface ChapterRecap {
  id: string
  title: string
  solo: boolean
  /** Null when the chapter was skipped or interrupted: no evidence saved. */
  input: TraceInput | null
}

export interface StoryNode {
  title: string
  detail: string
}

function choiceDetail(chapter: ChapterRecap | undefined): string {
  const prediction = chapter?.input?.prediction
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

function realityDetail(chapter: ChapterRecap | undefined): string {
  const verdict = chapter?.input?.verdict
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
      return `Prediction did not match${observed}`
    case 'CONSISTENT':
      return `Prediction matched${observed}`
    case 'UNASSESSABLE':
      return "Couldn't assess"
  }
}

function coachDetail(chapter: ChapterRecap | undefined): string {
  const coach = chapter?.input?.coach
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
    return `${input.verdict.status === 'CONTRADICTED' ? 'Did not match' : "Couldn't assess"} — see trace`
  }
  return lit === 1 ? 'Verified: 1 bulb lit' : `Verified: ${lit} bulbs lit`
}

/** Shown on proof cards and traces for chapters without saved evidence. */
export const MISSING_CHAPTER = 'Complete this chapter to unlock its evidence.'

/** Factual finale narrative, one sentence per completed chapter. Every
 * clause comes from a saved prediction, verdict, or solver reading;
 * skipped chapters contribute nothing instead of invented closure. */
export function finaleNarrative(chapters: ChapterRecap[]): string[] {
  const [l1, reality, transfer] = chapters
  const lines: string[] = []
  const first = l1?.input?.prediction
  if (first !== undefined && first !== null) {
    if (first.choice === 'yes') {
      lines.push('You predicted that the open circuit would light the bulb.')
    } else if (first.choice === 'no') {
      lines.push('You predicted that the open circuit would stay dark.')
    } else {
      lines.push('You were not sure whether the open circuit would light the bulb.')
    }
  }
  const contradiction = reality?.input?.verdict
  if (contradiction !== undefined && contradiction !== null) {
    const [entry] = Object.entries(contradiction.evidence)
    if (entry !== undefined) {
      const [key, watts] = entry
      const id = key.split('.')[0]
      const state = watts > LIT_POWER_W ? 'lit' : 'stayed dark'
      const amps = reality?.input?.result
      const current =
        amps !== undefined && amps !== null && amps.ok
          ? amps.components[id]?.current
          : undefined
      // The measurement is the reality-check open-switch run, not the L1
      // starting gap (which the solver rejects): name the circuit.
      lines.push(
        current === undefined
          ? `Then, with the switch open, the simulator measured ${formatReading(watts)} W and ${id} ${state}.`
          : `Then, with the switch open, the simulator measured ${formatReading(current)} A and ${formatReading(watts)} W, and ${id} ${state}.`,
      )
    }
  }
  const solo = transfer?.input
  if (solo?.verdict !== undefined && solo?.verdict !== null) {
    if (solo.verdict.status === 'CONSISTENT') {
      const bulbs =
        solo.netlist?.components.filter((component) => component.type === 'bulb') ?? []
      const lit = bulbs.filter(
        (bulb) => (solo.result?.components[bulb.id]?.power ?? 0) > LIT_POWER_W,
      ).length
      const count = lit === 1 ? '1 bulb lit' : `${lit} bulbs lit`
      lines.push(
        `You then completed a new circuit independently (${count}) and tested your prediction without AI coaching.`,
      )
    } else {
      lines.push(
        'Your independent circuit did not match your prediction — the trace above shows what the simulator measured.',
      )
    }
  }
  return lines
}

/** Three-beat proof strip: the claim, the evidence, the solo transfer. */
export function evidenceCards(chapters: ChapterRecap[]): StoryNode[] {
  const [l1, reality, transfer] = chapters
  return [
    { title: 'Prediction', detail: l1?.input ? choiceDetail(l1) : MISSING_CHAPTER },
    { title: 'Simulator evidence', detail: reality?.input ? realityDetail(reality) : MISSING_CHAPTER },
    { title: 'Independent transfer', detail: transfer?.input ? transferDetail(transfer) : MISSING_CHAPTER },
  ]
}

/** Five-beat story of the journey, derived from saved chapter evidence. */
export function storyNodes(chapters: ChapterRecap[]): StoryNode[] {
  const [l1, reality, transfer] = chapters
  return [
    { title: 'First belief', detail: choiceDetail(l1) },
    { title: 'Reality check evidence', detail: realityDetail(reality) },
    { title: 'Coach question', detail: coachDetail(reality) },
    { title: 'Solo prediction', detail: choiceDetail(transfer) },
    { title: 'Verified transfer', detail: transferDetail(transfer) },
  ]
}
