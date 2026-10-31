import { providerBadge } from '../api/client'
import { CHOICE_LABELS, LIT_POWER_W } from '../lessons/lesson'
import type { TraceInput } from '../lessons/trace'
import { formatReading } from '../components/format'
import { L1 } from '../lessons/l1'
import { TRANSFER } from '../lessons/transfer'

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

export interface LearningMilestone {
  title: string
  summary: string
  complete: boolean
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
  return `Predicted “${label}”  -  “${short}”`
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
    return `${input.verdict.status === 'CONTRADICTED' ? 'Did not match' : "Couldn't assess"}  -  see trace`
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
        `You then completed a new circuit independently (${count}) and tested your prediction without coach prompts.`,
      )
    } else {
      lines.push(
        'Your independent circuit did not match your prediction  -  the trace above shows what the simulator measured.',
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

function addedConnections(input: TraceInput | null | undefined, seedWireIds: Set<string>): string[] {
  return (
    input?.netlist?.components
      .filter((component) => component.type === 'wire' && !seedWireIds.has(component.id))
      .map((wire) => `${wire.a} ↔ ${wire.b}`) ?? []
  )
}

function predictionText(input: TraceInput | null | undefined): string {
  return input?.prediction === null || input?.prediction === undefined
    ? 'No prediction recorded'
    : `Predicted ${CHOICE_LABELS[input.prediction.choice]}`
}

/** Plain-language prediction clause, quoting the learner's own reason. */
function youPredicted(
  input: TraceInput | null | undefined,
  subject: Record<'yes' | 'no' | 'not_sure', string>,
): string {
  const prediction = input?.prediction
  if (prediction === null || prediction === undefined) {
    return 'You made no prediction'
  }
  const why = prediction.why.trim()
  const short = why.length > 48 ? `${why.slice(0, 47)}…` : why
  const reason = why === '' ? '' : ` (“${short}”)`
  return `You predicted ${subject[prediction.choice]}${reason}`
}

function verdictPhrase(input: TraceInput | null | undefined): string {
  switch (input?.verdict?.status) {
    case 'CONSISTENT':
      return 'your prediction matched'
    case 'CONTRADICTED':
      return 'your prediction was challenged'
    default:
      return ''
  }
}

/** What the learner actually tried with the switch demonstration, if anything. */
function demonstrationPhrase(input: TraceInput | null | undefined): string {
  const phases = new Set(input?.demonstrations?.map((event) => event.phase) ?? [])
  if (!phases.has('applied')) {
    return ''
  }
  const target =
    input?.netlist?.components.find((component) => component.type === 'switch')?.id ??
    'the switch'
  if (phases.has('observed') && phases.has('undone')) {
    return ` You tried closing ${target}, watched the bulb light, then put the open switch back.`
  }
  if (phases.has('observed')) {
    return ` You tried closing ${target} and watched the bulb light.`
  }
  return ` You tried closing ${target}.`
}

function bulbReadingText(input: TraceInput | null | undefined, bulbId: string): string {
  const reading = input?.result?.components[bulbId]
  return reading === undefined
    ? `${bulbId}: no reading`
    : `${bulbId} ${formatReading(reading.current)} A · ${formatReading(reading.power)} W`
}

/** Compact learner-specific recap, grounded in their prediction, wiring, and readings. */
export function learningProgress(chapters: ChapterRecap[]): LearningMilestone[] {
  const [first, reality, solo] = chapters
  const firstInput = first?.input
  const realityInput = reality?.input
  const openSwitch = realityInput?.netlist?.components.find(
    (component) => component.type === 'switch' && component.closed === false,
  )
  const soloInput = solo?.input
  const firstConnections = addedConnections(
    firstInput,
    new Set(L1.seed.edges.map((edge) => edge.id)),
  )
  const soloConnections = addedConnections(
    soloInput,
    new Set(TRANSFER.seed.edges.map((edge) => edge.id)),
  )

  const firstVerdict = verdictPhrase(firstInput)
  const realityVerdict = verdictPhrase(realityInput)
  const soloVerdict = verdictPhrase(soloInput)
  return [
    {
      title: 'Complete the loop',
      summary:
        firstInput?.result?.ok === true
          ? `${youPredicted(firstInput, { yes: 'the open circuit would light the bulb', no: 'the open circuit would stay dark', not_sure: 'you were not sure about the open circuit' })}. You connected ${firstConnections.length > 0 ? 'the missing return wire' : 'the circuit'}; the simulator measured ${bulbReadingText(firstInput, 'L1')}${firstVerdict === '' ? '.' : `, and ${firstVerdict}.`}`
          : firstInput?.prediction !== null && firstInput?.prediction !== undefined
            ? `${predictionText(firstInput)}; circuit not tested yet.`
            : 'Not reached yet.',
      complete: firstInput?.result?.ok === true,
    },
    {
      title: 'Test the open switch',
      summary:
        realityInput?.result?.ok === true
          ? `${youPredicted(realityInput, { yes: 'the bulb would light with the switch open', no: 'the bulb would stay dark with the switch open', not_sure: 'you were not sure about the open switch' })}. ${openSwitch?.id ?? 'The switch'} stayed open and the simulator measured ${bulbReadingText(realityInput, 'L1')}${realityVerdict === '' ? '.' : `, so ${realityVerdict}.`}${demonstrationPhrase(realityInput)}`
          : realityInput?.prediction !== null && realityInput?.prediction !== undefined
            ? `${predictionText(realityInput)}; circuit not tested yet.`
            : 'Not reached yet.',
      complete: realityInput?.result?.ok === true,
    },
    {
      title: 'Wire the second bulb solo',
      summary:
        soloInput?.result?.ok === true
          ? `${youPredicted(soloInput, { yes: 'both bulbs would light on your own', no: 'the second bulb would stay dark', not_sure: 'you were not sure about the second bulb' })}. You wired ${soloConnections.length > 0 ? 'the second bulb into the loop' : 'the solo circuit'} without a coach; the simulator measured ${bulbReadingText(soloInput, 'L2')}${soloVerdict === '' ? '.' : `, and ${soloVerdict}.`}`
          : soloInput?.prediction !== null && soloInput?.prediction !== undefined
            ? `${predictionText(soloInput)}; solo circuit not tested yet.`
            : 'Not reached yet.',
      complete: soloInput?.result?.ok === true,
    },
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
