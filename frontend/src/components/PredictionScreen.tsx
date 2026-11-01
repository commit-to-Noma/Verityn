import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { Challenge, Choice, Prediction } from '../lessons/lesson'
import { canProceed, CHOICE_LABELS, createPrediction } from '../lessons/lesson'
import { transcriptFill } from '../voice/spokenPrediction'
import MicButton from '../voice/MicButton'
import CoachVoiceToggle from './CoachVoiceToggle'
import CircuitPreview from './CircuitPreview'
import ProofChips from './ProofChips'

const CHOICES = Object.entries(CHOICE_LABELS) as [Choice, string][]

/** Guided-demo beats: the choice lands, the reason fills, then it commits. */
const DEMO_CHOICE_MS = 800
const DEMO_WHY_MS = 800
const DEMO_COMMIT_MS = 1800

export interface PredictionDemo {
  choice: Choice
  why: string
  /** While paused, no demo timer runs; resume restarts the remaining beats. */
  paused: boolean
  /** Skip bumps this: the demo commits its pending action immediately. */
  signal: number
  /** Manual input takes over: the demo exits and the learner's answer stands. */
  onTakeover: () => void
}

/** One neutral selected state: a prediction is a choice, not a grade. */
const CHOICE_ACTIVE = { box: 'border-flow bg-flow/10', icon: 'text-flow' }

/** Think-first gate: the learner predicts before touching the canvas. */
export default function PredictionScreen({
  challenge,
  eyebrow,
  coachVoiceEnabled,
  onCoachVoiceEnabledChange,
  onComplete,
  continueLabel = 'Continue to fix it',
  demo,
  proofStage,
}: {
  challenge: Challenge
  eyebrow: string
  coachVoiceEnabled?: boolean
  onCoachVoiceEnabledChange?: (enabled: boolean) => void
  onComplete: (prediction: Prediction) => void
  continueLabel?: string
  demo?: PredictionDemo
  /** Trace stage id for proof chips. */
  proofStage?: string
}) {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [why, setWhy] = useState('')
  const [micStatus, setMicStatus] = useState('')
  const ready = canProceed(choice)
  const committed = useRef(false)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  })

  const commit = (nextChoice: Choice, nextWhy: string) => {
    if (committed.current) {
      return
    }
    committed.current = true
    onCompleteRef.current(createPrediction(challenge.id, nextChoice, nextWhy))
  }

  // Scripted beats run only while the demo is active and unpaused; any
  // change (pause, resume, skip) restarts the timers from the current
  // visible state, and unmount/takeover clears them.
  const demoChoice = demo?.choice
  const demoWhy = demo?.why
  const demoPaused = demo?.paused ?? true
  const demoSignal = demo?.signal ?? 0
  // A skip is a signal change after mount; pause/resume replay the beats.
  const mountSignal = useRef(demoSignal)
  useEffect(() => {
    if (demo === undefined || demoChoice === undefined || demoWhy === undefined) {
      return
    }
    if (demoPaused || committed.current) {
      return
    }
    const skipped = demoSignal !== mountSignal.current
    const timers: number[] = []
    if (!skipped) {
      timers.push(window.setTimeout(() => setChoice(demoChoice), DEMO_CHOICE_MS))
      timers.push(
        window.setTimeout(() => setWhy(demoWhy), DEMO_CHOICE_MS + DEMO_WHY_MS),
      )
      timers.push(
        window.setTimeout(
          () => commit(demoChoice, demoWhy),
          DEMO_CHOICE_MS + DEMO_WHY_MS + DEMO_COMMIT_MS,
        ),
      )
    } else {
      // A skip (or a resumed skip) lands the answer at once.
      setChoice(demoChoice)
      setWhy(demoWhy)
      timers.push(window.setTimeout(() => commit(demoChoice, demoWhy), 60))
    }
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
    // The demo script is stable per stage; signal/paused drive re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, demoChoice, demoWhy, demoPaused, demoSignal])

  /** Manual input cancels the script and hands the screen to the learner. */
  const manual = () => {
    if (demo !== undefined && !committed.current) {
      demo.onTakeover()
    }
  }

  /** Spoken reason fills the Why field and pre-selects a clear choice; the
   * learner still confirms with Continue. Interpretation is local keyword
   * matching, and transcription never calls the coach, so Solo stays coach-free. */
  const handleTranscript = (transcript: string) => {
    manual()
    const fill = transcriptFill(transcript)
    setWhy(fill.why)
    if (fill.choice !== null) {
      setChoice(fill.choice)
    }
    setMicStatus(fill.status)
  }

  return (
    <section
      aria-labelledby="predict-heading"
      className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
    >
      <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-40">
        <div>
          <p className="text-flow mb-1 text-xs font-semibold uppercase tracking-[0.18em]">{eyebrow}</p>
          <h2 id="predict-heading" className="text-xl font-semibold">
            {challenge.title}
          </h2>
        </div>
        <CircuitPreview
          seed={challenge.seed}
          label={`${challenge.title} starting circuit`}
          className="h-64 sm:h-72 md:h-[min(60vh,460px)]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
      {onCoachVoiceEnabledChange !== undefined && (
        <CoachVoiceToggle
          enabled={coachVoiceEnabled ?? false}
          onChange={onCoachVoiceEnabledChange}
        />
      )}
      {challenge.brief !== undefined && (
        <div className="rounded-2xl border border-glass-border p-4" aria-label="Challenge brief">
          <p className="text-sm">{challenge.brief.setup}</p>
          <p className="mt-1 text-sm font-medium">{challenge.brief.task}</p>
        </div>
      )}
      <p className="text-lg font-semibold">{challenge.question}</p>
      {demo !== undefined && (
        <p className="text-ink-muted text-sm" aria-live="polite">
          Demo prediction  -  touch anything to take over.
        </p>
      )}
      <div className="flex gap-2" role="group" aria-label="Your prediction">
        {CHOICES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            title={
              value === 'yes'
                ? 'Yes — I think the bulb will light'
                : value === 'no'
                  ? 'No — I think the bulb will stay dark'
                  : 'Not sure — record my uncertainty and test anyway'
            }
            onClick={() => {
              manual()
              setChoice(value)
            }}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] border text-sm font-medium transition ${
              choice === value ? CHOICE_ACTIVE.box : 'border-glass-border'
            }`}
          >
            {choice === value && (
              <Check className={`h-4 w-4 ${CHOICE_ACTIVE.icon}`} aria-hidden="true" />
            )}
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="predict-why" className="text-sm font-medium">
          Why? <span className="text-ink-muted font-normal">(optional)</span>
        </label>
        <div className="relative">
          <input
            id="predict-why"
            type="text"
            value={why}
            onChange={(event) => {
              manual()
              setWhy(event.target.value)
            }}
            maxLength={140}
            placeholder="Add a reason, or leave this blank"
            autoComplete="off"
            className="border-glass-border min-h-[44px] w-full rounded-[10px] border px-3 pr-12 text-base"
          />
          <MicButton onTranscript={handleTranscript} onStatus={setMicStatus} />
        </div>
        <p className="text-ink-muted text-xs">
          Voice is optional. Audio is sent to Meta to be transcribed and is not saved.
        </p>
        {micStatus !== '' && (
          <p className="text-ink-muted text-sm" aria-live="polite">
            {micStatus}
          </p>
        )}
        {why.trim() !== '' && (
          <p className="text-ink-muted text-sm" aria-live="polite">
            Your reasoning is recorded. We&apos;ll test it against the circuit.
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            manual()
            if (choice) {
              commit(choice, why)
            }
          }}
          className="bg-flow text-on-accent flex min-h-[44px] min-w-40 items-center justify-center rounded-[10px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {continueLabel}
        </button>
        {!ready && <p className="text-ink-muted text-sm">Choose Yes, No, or Not sure to continue.</p>}
      </div>
      <ProofChips stages={proofStage === undefined ? [] : [proofStage]} />
      </div>
    </section>
  )
}
