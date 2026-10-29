import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { Challenge, Choice, Prediction } from '../lessons/lesson'
import { canProceed, CHOICE_LABELS, createPrediction } from '../lessons/lesson'
import MicButton from '../voice/MicButton'
import CircuitPreview from './CircuitPreview'
import CoachNote from './CoachNote'

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

const CHOICE_ACTIVE: Record<Choice, { box: string; icon: string }> = {
  yes: { box: 'border-ok bg-ok/10', icon: 'text-ok' },
  no: { box: 'border-bad bg-bad/10', icon: 'text-bad' },
  not_sure: { box: 'border-unsure bg-unsure/10', icon: 'text-unsure' },
}

/** Think-first gate: the learner predicts before touching the canvas. */
export default function PredictionScreen({
  challenge,
  eyebrow,
  coachLine,
  onComplete,
  continueLabel = 'Continue to fix it',
  demo,
}: {
  challenge: Challenge
  eyebrow: string
  coachLine?: string
  onComplete: (prediction: Prediction) => void
  continueLabel?: string
  demo?: PredictionDemo
}) {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [why, setWhy] = useState('')
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

  return (
    <section aria-labelledby="predict-heading" className="flex flex-col gap-4">
      <div>
        <p className="text-flow mb-1 text-xs font-semibold uppercase tracking-[0.18em]">{eyebrow}</p>
        <h2 id="predict-heading" className="text-xl font-semibold">
          {challenge.title}
        </h2>
      </div>
      <CircuitPreview seed={challenge.seed} label={`${challenge.title} starting circuit`} />
      {coachLine !== undefined && <CoachNote>{coachLine}</CoachNote>}
      {challenge.brief !== undefined && (
        <div className="rounded-2xl border border-glass-border p-4" aria-label="Challenge brief">
          <p className="text-sm">{challenge.brief.setup}</p>
          <p className="mt-1 text-sm font-medium">{challenge.brief.task}</p>
        </div>
      )}
      <p className="text-lg font-semibold">{challenge.question}</p>
      {demo !== undefined && (
        <p className="text-ink-muted text-sm" aria-live="polite">
          Demo prediction — touch anything to take over.
        </p>
      )}
      <div className="flex gap-2" role="group" aria-label="Your prediction">
        {CHOICES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            onClick={() => {
              manual()
              setChoice(value)
            }}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] border text-sm font-medium transition ${
              choice === value ? CHOICE_ACTIVE[value].box : 'border-glass-border'
            }`}
          >
            {choice === value && (
              <Check className={`h-4 w-4 ${CHOICE_ACTIVE[value].icon}`} aria-hidden="true" />
            )}
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="predict-why" className="text-sm font-medium">
          Why do you think so? <span className="text-ink-muted font-normal">(one line)</span>
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
            placeholder="One line is enough"
            autoComplete="off"
            className="border-glass-border min-h-[44px] w-full rounded-[10px] border px-3 pr-12 text-base"
          />
          <MicButton
            onTranscript={(text) => {
              manual()
              setWhy((current) => (current.trim() === '' ? text : `${current} ${text}`))
            }}
          />
        </div>
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
    </section>
  )
}
