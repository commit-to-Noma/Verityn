export interface CoachStatement {
  text: string
  provider: string | null
}

let latestStatement: CoachStatement | null = null
const coachStatements: CoachStatement[] = []
let speechGeneration = 0
let speechFinishedBeforeSubscribe = false
const finishedListeners = new Set<() => void>()
const statementListeners = new Set<(statement: CoachStatement) => void>()
const VOICE_NAME_PREFERENCE = [
  'premium',
  'enhanced',
  'neural',
  'natural',
  'google',
  'samantha',
  'ava',
  'serena',
]
const SENTENCE_PAUSE_MS = 180

interface VoiceCandidate {
  name: string
  lang: string
}

export function chooseCoachVoice<T extends VoiceCandidate>(
  voices: readonly T[],
): T | null {
  const englishVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith('en'),
  )
  let best: T | null = null
  let bestRank = VOICE_NAME_PREFERENCE.length
  for (const voice of englishVoices) {
    const name = voice.name.toLowerCase()
    const match = VOICE_NAME_PREFERENCE.findIndex((preference) =>
      name.includes(preference),
    )
    const rank = match < 0 ? VOICE_NAME_PREFERENCE.length : match
    if (best === null || rank < bestRank) {
      best = voice
      bestRank = rank
    }
  }
  return best
}

function speechParts(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["“'‘(]*[A-Z])/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function notifySpeechFinished(): void {
  if (finishedListeners.size === 0) {
    speechFinishedBeforeSubscribe = true
    return
  }
  for (const listener of finishedListeners) {
    listener()
  }
}

export function subscribeCoachSpeechFinished(listener: () => void): () => void {
  finishedListeners.add(listener)
  if (speechFinishedBeforeSubscribe) {
    speechFinishedBeforeSubscribe = false
    queueMicrotask(listener)
  }
  return () => finishedListeners.delete(listener)
}

export function subscribeCoachStatement(listener: (statement: CoachStatement) => void): () => void {
  statementListeners.add(listener)
  return () => statementListeners.delete(listener)
}

export function showCoachText(text: string, provider: string | null = null): void {
  const statement = { text, provider }
  latestStatement = statement
  const previous = coachStatements[coachStatements.length - 1]
  if (previous?.text !== text || previous.provider !== provider) {
    coachStatements.push(statement)
    if (coachStatements.length > 20) {
      coachStatements.shift()
    }
  }
  for (const listener of statementListeners) {
    listener(statement)
  }
}

export function speakCoach(
  text: string,
  options?: { force?: boolean; provider?: string | null },
): boolean {
  const repeat = text === latestStatement?.text
  const provider = options?.provider ?? (repeat ? latestStatement?.provider ?? null : null)
  showCoachText(text, provider)
  if (repeat && options?.force !== true) {
    // Same line twice in a row: keep the caption, skip the re-speak so a
    // re-render or repeated event cannot trap the learner in a spoken loop.
    return true
  }
  const host = globalThis as typeof globalThis & {
    speechSynthesis?: SpeechSynthesis
    SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance
  }
  const synthesis = host.speechSynthesis
  const Utterance = host.SpeechSynthesisUtterance
  if (synthesis === undefined || Utterance === undefined) {
    return false
  }
  const generation = ++speechGeneration
  speechFinishedBeforeSubscribe = false
  synthesis.cancel()
  const parts = speechParts(text)
  const voice = chooseCoachVoice(synthesis.getVoices())
  const speakPart = (index: number) => {
    if (generation !== speechGeneration) {
      return
    }
    const utterance = new Utterance(parts[index] ?? text)
    utterance.rate = 0.95
    utterance.pitch = 1.04
    utterance.voice = voice
    const ended = () => {
      if (generation !== speechGeneration) {
        return
      }
      if (index + 1 < parts.length) {
        globalThis.setTimeout(() => speakPart(index + 1), SENTENCE_PAUSE_MS)
      } else {
        notifySpeechFinished()
      }
    }
    const failed = () => {
      if (generation === speechGeneration) {
        notifySpeechFinished()
      }
    }
    utterance.onend = ended
    utterance.onerror = failed
    synthesis.speak(utterance)
  }
  speakPart(0)
  return true
}

export function repeatCoach(): boolean {
  return latestStatement !== null &&
    speakCoach(latestStatement.text, { force: true, provider: latestStatement.provider })
}

export function stopCoach(): void {
  const host = globalThis as typeof globalThis & { speechSynthesis?: SpeechSynthesis }
  speechGeneration += 1
  speechFinishedBeforeSubscribe = false
  host.speechSynthesis?.cancel()
}

export function latestCoachStatement(): string {
  return latestStatement?.text ?? ''
}

export function latestCoachMessage(): CoachStatement | null {
  return latestStatement
}

export function coachStatementHistory(): CoachStatement[] {
  return coachStatements.slice()
}
