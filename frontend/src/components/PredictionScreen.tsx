import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Challenge, Choice, Prediction } from '../lessons/lesson'
import { canProceed, CHOICE_LABELS, createPrediction } from '../lessons/lesson'
import CircuitPreview from './CircuitPreview'

const CHOICES = Object.entries(CHOICE_LABELS) as [Choice, string][]

/** Think-first gate: the learner predicts before touching the canvas. */
export default function PredictionScreen({
  challenge,
  eyebrow,
  onComplete,
}: {
  challenge: Challenge
  eyebrow: string
  onComplete: (prediction: Prediction) => void
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
      <p className="text-lg font-semibold">{challenge.question}</p>
      <div className="flex gap-2" role="group" aria-label="Your prediction">
        {CHOICES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            onClick={() => setChoice(value)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] border text-sm font-medium ${
              choice === value ? 'border-flow' : 'border-glass-border'
            }`}
          >
            {choice === value && <Check className="h-4 w-4 text-flow" aria-hidden="true" />}
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="predict-why" className="text-sm font-medium">
          Why do you think so? <span className="text-ink-muted font-normal">(one line)</span>
        </label>
        <input
          id="predict-why"
          type="text"
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          maxLength={140}
          placeholder="One line is enough"
          autoComplete="off"
          className="border-glass-border min-h-[44px] rounded-[10px] border px-3 text-base"
        />
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
          Continue to fix it
        </button>
        {!ready && <p className="text-ink-muted text-sm">Choose Yes, No, or Not sure to continue.</p>}
      </div>
    </section>
  )
}
