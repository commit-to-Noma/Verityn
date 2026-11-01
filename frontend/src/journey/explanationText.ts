export function isDeclarativeExplanation(text: string): boolean {
  return !/[?？]["'”’)\]]*\s*$/.test(text.trim())
}
