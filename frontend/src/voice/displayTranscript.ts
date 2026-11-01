const FILLER_WORDS = /\b(?:um+|uh+|erm+)\b[\s,]*/giu
const MAX_REPEATED_PHRASE_WORDS = 8

function comparableWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase()
}

/** Clean transcript artifacts for display without modifying the saved text. */
export function cleanTranscriptForDisplay(text: string): string {
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

  return tokens.join(' ').replace(/\s+([,.!?;:])/g, '$1')
}
