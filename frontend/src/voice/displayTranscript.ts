const FILLER_WORDS = /\b(?:um+|uh+|erm+)\b[\s,]*/giu
const MAX_REPEATED_PHRASE_WORDS = 8
/** An echoed prompt must match at least this many leading words to strip. */
const MIN_ECHO_WORDS = 3

function comparableWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase()
}

/** Strip a leading run where the learner read the prompt aloud. */
function stripEchoedQuestion(tokens: string[], question: string): string[] {
  const prompt = question
    .replace(FILLER_WORDS, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  let match = 0
  while (
    match < tokens.length &&
    match < prompt.length &&
    comparableWord(tokens[match] ?? '') !== '' &&
    comparableWord(tokens[match] ?? '') === comparableWord(prompt[match] ?? '')
  ) {
    match += 1
  }
  if (match < MIN_ECHO_WORDS) {
    return tokens
  }
  return tokens.slice(match)
}

/** Clean transcript artifacts for display without modifying the saved text. */
export function cleanTranscriptForDisplay(text: string, question?: string): string {
  const tokens = text
    .replace(FILLER_WORDS, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  for (let phraseLength = Math.min(MAX_REPEATED_PHRASE_WORDS, Math.floor(tokens.length / 2));
    phraseLength >= 1;
    phraseLength -= 1) {
    let index = 0
    while (index + phraseLength * 2 <= tokens.length) {
      const repeated = tokens
        .slice(index, index + phraseLength)
        .every(
          (word, offset) =>
            comparableWord(word) === comparableWord(tokens[index + phraseLength + offset] ?? ''),
        )
      if (!repeated) {
        index += 1
        continue
      }

      const removed = tokens.splice(index + phraseLength, phraseLength)
      const punctuation = /[.!?,;:]+$/.exec(removed.at(-1) ?? '')?.[0]
      const previous = tokens[index + phraseLength - 1]
      if (
        punctuation !== undefined &&
        previous !== undefined &&
        !/[.!?,;:]+$/.test(previous)
      ) {
        tokens[index + phraseLength - 1] = `${previous}${punctuation}`
      }
    }
  }

  const echoed =
    question === undefined || question.trim() === '' ? tokens : stripEchoedQuestion(tokens, question)

  const joined = echoed
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    // A stripped filler can strand its comma ("lights, um" → "lights,").
    .replace(/[,;:]+$/, '')
  // Fillers with stray punctuation ("Um, uh.") leave no words behind.
  if (!/[\p{L}\p{N}]/u.test(joined)) {
    return ''
  }
  const cleaned = joined
  // Stripping a leading filler can expose a lowercase start ("Um, no" → "no").
  return cleaned.replace(
    /^([^A-Za-z]*)([a-z])/,
    (_, prefix: string, first: string) => `${prefix}${first.toUpperCase()}`,
  )
}
