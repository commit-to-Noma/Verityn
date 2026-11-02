export interface VoiceTiming {
  stage: string
  speechToTranscriptMs: number
  transcriptToCoachReplyMs: number | null
  /** Raw transcript; display layers clean a copy, Trace keeps this. */
  transcript: string
}

const MAX_TIMINGS = 20
let timings: VoiceTiming[] = []
const listeners = new Set<(timings: VoiceTiming[]) => void>()

export function elapsedMs(start: number, end: number): number {
  return Math.max(0, Math.round(end - start))
}

export function recordVoiceTiming(timing: VoiceTiming): void {
  timings = [...timings, timing].slice(-MAX_TIMINGS)
  for (const listener of listeners) {
    listener([...timings])
  }
}

export function readVoiceTimings(): VoiceTiming[] {
  return [...timings]
}

export function subscribeVoiceTimings(listener: (timings: VoiceTiming[]) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function clearVoiceTimings(): void {
  timings = []
}
