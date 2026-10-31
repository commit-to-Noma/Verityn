import type { Choice } from '../lessons/lesson'
import { CHOICE_LABELS } from '../lessons/lesson'

const UNSURE_PATTERN =
  /\b(?:not sure|unsure|uncertain|don't know|do not know|no idea|maybe|can't tell|cannot tell|hard to tell)\b/
const NO_PATTERN =
  /\b(?:no|won't|wouldn't|will not|doesn't|does not|isn't|is not|can't|cannot|never)\b|\b(?:not|stay|stays|remain|remains)\s+(?:light|lit|glow|glowing|on|dark|off)\b|\b(?:stay|stays|remain|remains)\s+dark\b/
const YES_PATTERN =
  /\b(?:yes|will light|lights up|light up|will glow|glows|turn on|will turn on|bulb lights|should light|should glow)\b/

export interface TranscriptFill {
  why: string
  choice: Choice | null
  status: string
}

/** Fill the Why field from a transcript and pre-select a clear choice; the
 * learner still confirms with Continue. Pure so it stays unit-testable. */
export function transcriptFill(transcript: string): TranscriptFill {
  const why = transcript.slice(0, 140)
  const choice = spokenPredictionChoice(transcript)
  if (choice === null) {
    return {
      why,
      choice,
      status: 'Transcript added. Choose Yes, No, or Not sure to match what you said.',
    }
  }
  return {
    why,
    choice,
    status: `Heard “${transcript.slice(0, 80)}”. Selected ${CHOICE_LABELS[choice]} — change it or press Continue.`,
  }
}

/** Match clear spoken prediction choices; leave ambiguous replies conversational. */
export function spokenPredictionChoice(text: string): Choice | null {
  const normalized = text.trim().toLowerCase().replace(/[’]/g, "'")
  if (UNSURE_PATTERN.test(normalized)) {
    return 'not_sure'
  }
  if (NO_PATTERN.test(normalized)) {
    return 'no'
  }
  if (YES_PATTERN.test(normalized)) {
    return 'yes'
  }
  return null
}
