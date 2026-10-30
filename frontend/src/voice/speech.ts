/** Optional voice interaction through browser capabilities only.
 *
 * Speech synthesis reads real coach text aloud; speech recognition fills
 * ordinary learner inputs. Both are strictly optional: every flow works
 * with text alone, and unsupported browsers keep the text experience.
 * Nothing here is a Meta-generated voice  -  synthesis is the browser's.
 * Pure wrappers over injected hosts; tests use mocked capabilities.
 */

export interface SpeechSupport {
  synthesis: boolean
  recognition: boolean
}

/** Detect browser speech capabilities without touching the network. */
export function speechSupport(host: Record<string, unknown> = globalThis): SpeechSupport {
  return {
    synthesis:
      typeof host.speechSynthesis !== 'undefined' && host.speechSynthesis !== null,
    recognition:
      (typeof host.SpeechRecognition !== 'undefined' && host.SpeechRecognition !== null) ||
      (typeof host.webkitSpeechRecognition !== 'undefined' && host.webkitSpeechRecognition !== null),
  }
}

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
    onState('unsupported')
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

export type ListenState =
  | 'idle'
  | 'listening'
  | 'denied'
  | 'no-speech'
  | 'unavailable'
  | 'unsupported'

interface RecognitionInstance extends Record<string, unknown> {
  lang: string
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
}

export interface Recognizer {
  start(): void
  stop(): void
}

/** Wrap SpeechRecognition; transcripts enter the ordinary input path. */
export function createRecognizer(
  host: Record<string, unknown>,
  hooks: { onTranscript: (text: string) => void; onState: (state: ListenState) => void },
): Recognizer {
  const Factory = (host.SpeechRecognition ?? host.webkitSpeechRecognition) as
    | (new () => RecognitionInstance)
    | undefined
  if (Factory === undefined || Factory === null) {
    hooks.onState('unsupported')
    const noop = () => hooks.onState('unsupported')
    return { start: noop, stop: noop }
  }
  let active: RecognitionInstance | null = null
  const finish = (state: ListenState) => {
    active = null
    hooks.onState(state)
  }
  return {
    start() {
      if (active !== null) {
        return
      }
      const recognition = new Factory()
      recognition.lang = 'en-US'
      recognition.interimResults = false
      recognition.onresult = (event: unknown) => {
        const results = (event as { results?: ArrayLike<{ 0?: { transcript?: string } }> }).results
        const last = results !== undefined ? results[results.length - 1] : undefined
        const text = last?.[0]?.transcript?.trim() ?? ''
        if (text !== '') {
          hooks.onTranscript(text)
        }
        try {
          recognition.stop()
        } catch {
          // Already stopped; the end handler still runs.
        }
      }
      recognition.onerror = (event: unknown) => {
        const code = (event as { error?: string }).error ?? ''
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          finish('denied')
        } else if (code === 'no-speech') {
          finish('no-speech')
        } else {
          finish('unavailable')
        }
      }
      recognition.onend = () => {
        if (active !== null) {
          finish('idle')
        }
      }
      active = recognition
      hooks.onState('listening')
      try {
        recognition.start()
      } catch {
        finish('unavailable')
      }
    },
    stop() {
      if (active !== null) {
        const recognition = active
        active = null
        try {
          recognition.abort()
        } catch {
          // Already finished; nothing to abort.
        }
        hooks.onState('idle')
      }
    },
  }
}
