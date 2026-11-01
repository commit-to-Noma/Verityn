import type { Choice } from '../lessons/lesson'

export const PREDICTION_CLARIFICATION_PROMPT =
  'Do you think the bulb will light: yes, no or not sure?'
export const VOICE_LOCK_MS = 3000

const UNSURE_PATTERN =
  /\b(?:not sure|unsure|uncertain|don't know|do not know|no idea|maybe|can't tell|cannot tell|hard to tell)\b/
const NO_PATTERN =
  /\b(?:no|won't|wouldn't|will not|doesn't|does not|isn't|is not|can't|cannot|never)\b|\b(?:not|stay|stays|remain|remains)\s+(?:light|lit|glow|glowing|on|dark|off)\b|\b(?:stay|stays|remain|remains)\s+dark\b/
const YES_PATTERN =
  /\b(?:yes|will light|lights up|light up|will glow|glows|turn on|will turn on|bulb lights|should light|should glow)\b/

export interface TranscriptFill {
  why: string
  choice: Choice | null
}

/** Fill the Why field from a transcript and identify whether it can be locked in. */
export function transcriptFill(transcript: string): TranscriptFill {
  const why = transcript.slice(0, 140)
  const choice = spokenPredictionChoice(transcript)
  return { why, choice }
}

/** Schedule a clear spoken prediction to commit after its undo window. */
export function scheduleVoiceLock(onLock: () => void): () => void {
  const timer = globalThis.setTimeout(onLock, VOICE_LOCK_MS)
  return () => globalThis.clearTimeout(timer)
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
