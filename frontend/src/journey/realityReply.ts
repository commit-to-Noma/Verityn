/** Reality Check follow-up: code-written, solver-grounded, never a model call.
 *
 * After the open-switch test the coach asks one answerable question. The
 * learner's reply is matched here, in code, so a Predict-stage fallback
 * ("What do you expect the circuit to do...") can never leak into this
 * stage from a coach provider.
 */

export const REALITY_FOLLOWUP_QUESTION =
  'What would you change to make the bulb light?'

const CLOSE_MATCH = /clos(e|ing|ed)?|switch/i
const ON_MATCH = /\bon\b/i

/** Code-written answer for a Reality Check reply. Pure and tested. */
export function realityReplyFor(transcript: string): string {
  const text = transcript.toLowerCase()
  if (CLOSE_MATCH.test(text) || ON_MATCH.test(text)) {
    return 'Yes. Closing the switch completes the loop.'
  }
  return (
    'The open switch is the gap. Another battery adds push but the path ' +
    'is still broken. Try closing S1.'
  )
}
