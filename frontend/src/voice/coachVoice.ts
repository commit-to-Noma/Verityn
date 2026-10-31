let latestStatement = ''
let speechGeneration = 0
let speechFinishedBeforeSubscribe = false
const finishedListeners = new Set<() => void>()
const statementListeners = new Set<(text: string) => void>()

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

export function subscribeCoachStatement(listener: (text: string) => void): () => void {
  statementListeners.add(listener)
  return () => statementListeners.delete(listener)
}

export function showCoachText(text: string): void {
  latestStatement = text
  for (const listener of statementListeners) {
    listener(text)
  }
}

export function speakCoach(text: string, options?: { force?: boolean }): boolean {
  const repeat = text === latestStatement
  showCoachText(text)
  if (repeat && options?.force !== true) {
    // Same line twice in a row: keep the caption, skip the re-speak so a
    // re-render or repeated event cannot trap the learner in a spoken loop.
    return true
  }
  const host = globalThis as typeof globalThis & {
    speechSynthesis?: SpeechSynthesis
    SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance
  }
  if (host.speechSynthesis === undefined || host.SpeechSynthesisUtterance === undefined) {
    return false
  }
  const generation = ++speechGeneration
  speechFinishedBeforeSubscribe = false
  host.speechSynthesis.cancel()
  const utterance = new host.SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  utterance.pitch = 1.04
  const voices = host.speechSynthesis.getVoices()
  utterance.voice =
    voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith('en') &&
        /natural|premium|enhanced|neural/i.test(voice.name),
    ) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ??
    null
  const finished = () => {
    if (generation === speechGeneration) {
      notifySpeechFinished()
    }
  }
  utterance.onend = finished
  host.speechSynthesis.speak(utterance)
  return true
}

export function repeatCoach(): boolean {
  return latestStatement !== '' && speakCoach(latestStatement, { force: true })
}

export function stopCoach(): void {
  const host = globalThis as typeof globalThis & { speechSynthesis?: SpeechSynthesis }
  speechGeneration += 1
  speechFinishedBeforeSubscribe = false
  host.speechSynthesis?.cancel()
}

export function latestCoachStatement(): string {
  return latestStatement
}
