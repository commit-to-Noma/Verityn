/** Optional spoken playback through browser speech synthesis.
 *
 * Transcription uses Meta Muse Voice Transcribe through the backend; the
 * learner's text path remains available without microphone access.
 * Pure wrappers over injected hosts; tests use mocked capabilities.
 */

export type SpeakState = 'idle' | 'speaking' | 'paused' | 'unsupported'

interface SynthesisHost {
  speak(utterance: unknown): void
  cancel(): void
  pause(): void
  resume(): void
}

export interface Speaker {
  speak(text: string): void
  pause(): void
  resume(): void
  stop(): void
}

/** Wrap speechSynthesis with explicit idle/speaking/paused states. */
export function createSpeaker(
  host: Record<string, unknown>,
  onState: (state: SpeakState) => void,
): Speaker {
  const synthesis = host.speechSynthesis as SynthesisHost | undefined
  const Utterance = host.SpeechSynthesisUtterance as
    | (new (text: string) => Record<string, unknown>)
    | undefined
  if (synthesis === undefined || synthesis === null || Utterance === undefined) {
    const noop = () => onState('unsupported')
    return { speak: noop, pause: noop, resume: noop, stop: noop }
  }
  let current: Record<string, unknown> | null = null
  const finish = () => {
    current = null
    onState('idle')
  }
  return {
    speak(text: string) {
      synthesis.cancel()
      const utterance = new Utterance(text)
      utterance.onend = finish
      utterance.onerror = finish
      current = utterance
      onState('speaking')
      synthesis.speak(utterance)
    },
    pause() {
      if (current !== null) {
        synthesis.pause()
        onState('paused')
      }
    },
    resume() {
      if (current !== null) {
        synthesis.resume()
        onState('speaking')
      }
    },
    stop() {
      synthesis.cancel()
      finish()
    },
  }
}
