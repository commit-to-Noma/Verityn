/** Plain-language component names for learner-facing explanations.
 *
 * Canvas ids stay technical (B1, L1, S1) for traces and netlists, but
 * explanations should read "Battery 1" and "Light 1" instead of codes.
 */

const KIND_WORDS: Record<string, string> = {
  b: 'Battery',
  battery: 'Battery',
  l: 'Light',
  bulb: 'Light',
  s: 'Switch',
  switch: 'Switch',
}

/** "L1" -> "Light 1"; unknown shapes pass through unchanged. */
export function friendlyComponentName(id: string): string {
  const match = /^([A-Za-z]+)(\d+)$/.exec(id.trim())
  if (match === null) {
    return id
  }
  const word = KIND_WORDS[match[1].toLowerCase()]
  if (word === undefined) {
    return id
  }
  return `${word} ${match[2]}`
}
