import { useState } from 'react'
import { Check, Mic } from 'lucide-react'
import type { Challenge, Choice, Prediction } from '../lessons/lesson'
import { canProceed, CHOICE_LABELS, createPrediction } from '../lessons/lesson'
import CircuitPreview from './CircuitPreview'
import CoachNote from './CoachNote'

const CHOICES = Object.entries(CHOICE_LABELS) as [Choice, string][]

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
}: {
  challenge: Challenge
  eyebrow: string
  coachLine?: string
  onComplete: (prediction: Prediction) => void
  continueLabel?: string
}) {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [why, setWhy] = useState('')
  const ready = canProceed(choice)

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
      <div className="flex gap-2" role="group" aria-label="Your prediction">
        {CHOICES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            onClick={() => setChoice(value)}
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
            onChange={(event) => setWhy(event.target.value)}
            maxLength={140}
            placeholder="One line is enough"
            autoComplete="off"
            className="border-glass-border min-h-[44px] w-full rounded-[10px] border px-3 pr-12 text-base"
          />
          <button
            type="button"
            disabled
            title="Voice input coming soon (Muse Voice Transcribe)"
            aria-label="Voice input coming soon"
            className="text-ink-muted absolute top-1/2 right-2 -translate-y-1/2 cursor-not-allowed rounded-[8px] p-2 opacity-40"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
          </button>
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
            if (choice) {
              onComplete(createPrediction(challenge.id, choice, why))
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
