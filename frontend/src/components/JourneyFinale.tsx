import { useEffect, useRef, useState } from 'react'
import type { ChapterRecap } from '../journey/story'
import { MISSING_CHAPTER } from '../journey/story'
import { ApiError, explainResult, providerBadge } from '../api/client'
import { formatReading } from './format'
import { netlistPreviewSeed } from '../canvas/netlistPreview'
import { CHOICE_LABELS, LIT_POWER_W } from '../lessons/lesson'
import type { TraceInput } from '../lessons/trace'
import CircuitPreview from './CircuitPreview'
import EvidenceCard from './EvidenceCard'
import EvidenceTrace from './EvidenceTrace'
import MicButton from '../voice/MicButton'
import { useProofMode } from '../proof/store'
import { finaleRevealDelay } from '../journey/finaleMotion'
import PredictionVerdictLine from './PredictionVerdictLine'
import { batterySupplyLine } from '../journey/readings'
import { cleanTranscriptForDisplay } from '../voice/displayTranscript'
import type { LessonSeed } from '../lessons/lesson'
import { isDeclarativeExplanation } from '../journey/explanationText'

const CHAPTER_TITLES = ['Light the bulb', 'Open switch', 'Solo']

type ExplanationState =
  | { phase: 'loading' }
  | { phase: 'done'; text: string; provider: string }
  | { phase: 'error'; message: string }

function hasSavedPositions(input: TraceInput | null): boolean {
  const netlist = input?.netlist
  const positions = input?.nodePositions
  if (netlist === null || netlist === undefined || positions === undefined) {
    return false
  }
  const parts = netlist.components.filter((component) => component.type !== 'wire')
  return parts.length > 0 && parts.every((part) => {
    const position = positions[part.id]
    return position !== undefined && Number.isFinite(position.x) && Number.isFinite(position.y)
  })
}

function readingsFor(input: TraceInput | null): string[] {
  if (input?.result?.ok !== true || input.netlist === null) {
    return []
  }
  const bulbIndexes = new Map<string, number>()
  let nextBulb = 0
  for (const component of input.netlist.components) {
    if (component.type === 'bulb') {
      nextBulb += 1
      bulbIndexes.set(component.id, nextBulb)
    }
  }
  return input.netlist.components.flatMap((component) => {
    if (component.type !== 'battery' && component.type !== 'bulb') {
      return []
    }
    const reading = input.result?.components[component.id]
    if (reading === undefined) {
      return []
    }
    if (component.type === 'battery') {
      return [
        batterySupplyLine(reading.voltage, reading.current, reading.power),
      ]
    }
    const label = `Bulb ${bulbIndexes.get(component.id) ?? 1}`
    return [
      `${label}: ${formatReading(reading.voltage)} V · ${formatReading(reading.current)} A · ${formatReading(reading.power)} W`,
    ]
  })
}

function conceptFor(chapter: ChapterRecap, input: TraceInput | null): string | null {
  if (input?.result?.ok !== true || input.netlist === null) {
    return null
  }
  const bulb = input.netlist.components.find((component) => component.type === 'bulb')
  const reading = bulb === undefined ? undefined : input.result.components[bulb.id]
  if (chapter.solo) {
    const bulbs = input.netlist.components.filter((component) => component.type === 'bulb')
    const second = bulbs[1]
    const secondReading = second === undefined ? undefined : input.result.components[second.id]
    const battery = input.netlist.components.find((component) => component.type === 'battery')
    const batteryReading = battery === undefined ? undefined : input.result.components[battery.id]
    if (secondReading !== undefined && batteryReading !== undefined) {
      return `The second bulb is connected across the source; the solver measured ${formatReading(secondReading.voltage)} V across it and ${formatReading(batteryReading.voltage)} V at the battery.`
    }
  }
  if (chapter.id === 'L1T1' && reading !== undefined) {
    return `The open switch breaks the loop; the solver measured ${formatReading(reading.current)} A through the bulb.`
  }
  if (reading !== undefined) {
    return `A complete loop gives current a path through the bulb; the solver measured ${formatReading(reading.current)} A.`
  }
  return 'The solver recorded this circuit; its component readings are shown above.'
}

function verdictReading(chapter: ChapterRecap, input: TraceInput | null) {
  if (input?.prediction === null || input?.prediction === undefined || input.result?.ok !== true ||
      input.netlist === null) {
    return null
  }
  const bulbs = input.netlist.components.filter((component) => component.type === 'bulb')
  const claimed = chapter.solo ? (bulbs[1] ?? bulbs[0]) : bulbs[0]
  const reading = claimed === undefined ? undefined : input.result.components[claimed.id]
  if (claimed === undefined || reading === undefined) {
    return null
  }
  const label = chapter.solo ? 'the second bulb' : 'the bulb'
  return {
    choice: input.prediction.choice,
    current: reading.current,
    power: reading.power,
    lit: reading.power > LIT_POWER_W,
    component: label,
  }
}

function saidByLearner(input: TraceInput | null): string {
  const prediction = input?.prediction
  if (prediction === null || prediction === undefined) {
    return 'No prediction was recorded.'
  }
  const why = cleanTranscriptForDisplay(prediction.why)
  return why === ''
    ? `You predicted ${CHOICE_LABELS[prediction.choice]}.`
    : `You said: “${why}”`
}

/** Finale: three saved circuits, their predictions, and solver measurements. */
export default function JourneyFinale({
  chapters,
  onReturnHub,
  onExploreLens,
  onTryExperiment,
  onRestart,
}: {
  chapters: ChapterRecap[]
  onReturnHub: () => void
  onExploreLens: () => void
  onTryExperiment: (seed: LessonSeed, label: string) => void
  onRestart: () => void
}) {
  const [explanations, setExplanations] = useState<Record<string, ExplanationState>>({})
  const [reflection, setReflection] = useState('')
  const [includeReflection, setIncludeReflection] = useState(false)
  const [reflectionStatus, setReflectionStatus] = useState('')
  const controllers = useRef(new Map<string, AbortController>())
  const proof = useProofMode()

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort())
    },
    [],
  )

  const explainConcept = async (chapter: ChapterRecap) => {
    const input = chapter.input
    if (input?.netlist === null || input?.netlist === undefined || input.result?.ok !== true) {
      return
    }
    controllers.current.get(chapter.id)?.abort()
    const controller = new AbortController()
    controllers.current.set(chapter.id, controller)
    setExplanations((current) => ({ ...current, [chapter.id]: { phase: 'loading' } }))
    try {
      const answer = await explainResult(input.netlist, controller.signal)
      if (controller.signal.aborted) {
        return
      }
      if (!answer.valid || !isDeclarativeExplanation(answer.text)) {
        setExplanations((current) => ({
          ...current,
          [chapter.id]: {
            phase: 'error',
            message: answer.valid
              ? 'The explanation ended with a question; the solver-grounded concept remains.'
              : 'The explanation did not pass the number guard; the template remains.',
          },
        }))
        return
      }
      setExplanations((current) => ({
        ...current,
        [chapter.id]: {
          phase: 'done',
          text: answer.text,
          provider: answer.provider,
        },
      }))
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      setExplanations((current) => ({
        ...current,
        [chapter.id]: {
          phase: 'error',
          message: error instanceof ApiError
            ? error.message
            : 'Could not reach the explanation service; the template remains.',
        },
      }))
    } finally {
      if (controllers.current.get(chapter.id) === controller) {
        controllers.current.delete(chapter.id)
      }
    }
  }

  return (
    <section aria-labelledby="finale-heading" className="flex flex-col gap-5">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-flow">
          Guided Lab
        </p>
        <h2 id="finale-heading" className="text-2xl font-semibold">Your journey</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Three circuits from this session, with what you said and what the solver measured.
        </p>
      </header>

      <ol aria-label="Your circuit journey" className="flex flex-col gap-4">
        {chapters.map((chapter, index) => {
          const input = chapter.input
          const exactLayout = hasSavedPositions(input)
          const seed =
            input?.netlist === null || input?.netlist === undefined
              ? null
              : netlistPreviewSeed(
                  input.netlist,
                  exactLayout ? input.nodePositions : undefined,
                )
          const readings = readingsFor(input)
          const concept = conceptFor(chapter, input)
          const verdict = verdictReading(chapter, input)
          const explanationState = explanations[chapter.id]
          const title = CHAPTER_TITLES[index] ?? chapter.title
          return (
            <li
              key={chapter.id}
              className="finale-reveal"
              style={{ animationDelay: finaleRevealDelay(index) }}
            >
              <article className="glass-panel grid min-w-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <section aria-label={`${title} circuit`} className="min-w-0">
                  <h3 className="mb-2 text-lg font-semibold">
                    <span className="mr-2 text-flow">{index + 1}</span>
                    {title}
                  </h3>
                  {seed !== null && input?.result !== null && input?.result !== undefined ? (
                    <>
                      <CircuitPreview
                        seed={seed}
                        label={`${exactLayout ? 'Saved' : 'Redrawn'} ${title} circuit`}
                        result={input.result}
                        className="h-[210px] sm:h-[250px]"
                      />
                      {!exactLayout && (
                        <p className="mt-2 text-xs text-ink-muted">Redrawn from your netlist.</p>
                      )}
                    </>
                  ) : (
                    <div className="canvas-grid flex h-[210px] items-center justify-center rounded-2xl border border-glass-border p-6 text-center text-sm text-ink-muted sm:h-[250px]">
                      {MISSING_CHAPTER}
                    </div>
                  )}
                </section>

                <div className="flex min-w-0 flex-col gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">You said</h4>
                    <p className="mt-1 break-words text-sm text-ink-muted">{saidByLearner(input)}</p>
                  </div>
                  {verdict !== null && (
                    <PredictionVerdictLine {...verdict} />
                  )}
                  <div>
                    <h4 className="text-sm font-semibold">The solver measured</h4>
                    {readings.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-muted">
                        {readings.map((reading) => <li key={reading}>{reading}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-ink-muted">No solver measurements were saved.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-flow/30 bg-flow/5 p-3">
                    <h4 className="text-sm font-semibold">Concept</h4>
                    <p className="mt-1 text-sm">{concept ?? MISSING_CHAPTER}</p>
                    {input?.netlist !== null &&
                      input?.netlist !== undefined &&
                      input.result?.ok === true && (
                        <div className="mt-3 flex flex-col items-start gap-2">
                          <div className="flex flex-row flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void explainConcept(chapter)}
                              disabled={explanationState?.phase === 'loading'}
                              className="border-glass-border min-h-[40px] rounded-[10px] border px-3 text-xs font-medium disabled:opacity-50"
                            >
                              {explanationState?.phase === 'loading'
                                ? 'Explaining with Muse Spark…'
                                : 'Explain with Muse Spark'}
                            </button>
                            {seed !== null && (
                              <button
                                type="button"
                                aria-label={`Try ${title} in the Experiment Bay`}
                                onClick={() => onTryExperiment(seed, `${title} from your journey`)}
                                className="bg-flow text-on-accent min-h-[40px] rounded-[10px] px-3 text-xs font-medium"
                              >
                                Try it in the Experiment Bay
                              </button>
                            )}
                          </div>
                          {explanationState?.phase === 'done' && (
                            <div aria-live="polite">
                              <p className="text-sm">{explanationState.text}</p>
                              <p className="mt-1 text-xs text-ink-muted">
                                {explanationState.provider === 'meta-spark'
                                  ? 'Meta Spark'
                                  : providerBadge(explanationState.provider)}
                              </p>
                            </div>
                          )}
                          {explanationState?.phase === 'error' && (
                            <p className="text-sm text-ink-muted" role="status">{explanationState.message}</p>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              </article>
            </li>
          )
        })}
      </ol>

      <section aria-label="Reflection" className="glass-panel flex flex-col gap-3 p-4">
        <h3 className="font-semibold">What connection changed the circuit, and what reading helped you notice?</h3>
        <div className="relative">
          <textarea
            value={reflection}
            onChange={(event) => {
              setReflection(event.target.value)
              setReflectionStatus('')
            }}
            maxLength={120}
            rows={3}
            aria-label="Your reflection"
            className="border-glass-border min-h-24 w-full rounded-[10px] border p-3 pr-14 text-base"
            placeholder="Type your reflection, or use voice."
          />
          <MicButton
            stage="Finale reflection"
            onTranscript={(text) => {
              setReflection(text.slice(0, 120))
              setReflectionStatus('Transcript added. Edit it before saving.')
            }}
            onStatus={setReflectionStatus}
          />
        </div>
        {reflectionStatus !== '' && (
          <p className="text-ink-muted text-xs" role="status">{reflectionStatus}</p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeReflection}
            onChange={(event) => setIncludeReflection(event.target.checked)}
            className="mt-1"
          />
          Add my reflection to the Evidence card
        </label>
        {includeReflection && reflection.trim() !== '' && (
          <div className="rounded-xl border border-flow/30 p-3" aria-label="Saved reflection card">
            <p className="text-xs font-semibold uppercase tracking-wide text-flow">My reflection</p>
            <p className="mt-1 break-words text-sm">{reflection.trim()}</p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Restart the lab
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

      <details className="glass-panel p-4">
        <summary className="min-h-[44px] cursor-pointer content-center text-sm font-medium">
          See the full session trace
        </summary>
        <div className="mt-4 flex flex-col gap-5">
          {chapters.map((chapter) => (
            <article key={chapter.id} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{chapter.title}</h3>
              {chapter.input === null ? (
                <p className="text-ink-muted text-sm">{MISSING_CHAPTER}</p>
              ) : proof ? (
                <EvidenceTrace input={chapter.input} />
              ) : (
                <p className="text-ink-muted text-sm">Turn on trace details to see the solver record.</p>
              )}
            </article>
          ))}
        </div>
      </details>
      <details className="glass-panel p-4">
        <summary className="min-h-[44px] cursor-pointer content-center text-sm font-medium">
          Share your result
        </summary>
        <div className="mt-4">
          <EvidenceCard
            chapters={chapters}
            reflection={includeReflection ? reflection : null}
          />
        </div>
      </details>
    </section>
  )
}
