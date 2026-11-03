/** Reality Check follow-up: code-written, solver-grounded, never a model call.
 *
 * After the open-switch test the coach asks one answerable question. The
 * learner's reply is matched here, in code, so a Predict-stage fallback
 * ("What do you expect the circuit to do...") can never leak into this
 * stage from a coach provider.
 */

export const REALITY_FOLLOWUP_QUESTION =
  'What would you change to make the bulb light?'

/** Code-written re-prompt for replies that never engage the question. Ends
 * with a statement, never a second question, and names the unlock plainly. */
export const REALITY_REPLY_NUDGE =
  'Tell me which part you would change — the switch, the battery, or the ' +
  'wires — then I will open Solo.'

const CLOSE_MATCH = /clos(e|ing|ed)?|switch/i
const ON_MATCH = /\bon\b/i
const ENGAGED_MATCH =
  /switch|\bs1\b|open|clos|gap|break|brok|path|loop|current|batter|volt|wire|connect|complet|\bon\b/i

/**
 * True when the reply attempts the follow-up: it names a part or a
 * mechanism (switch, gap, path, battery...). Bare verdicts ("the bulb
 * will light"), shrugs, and empty lines do not count — the coach
 * re-prompts instead of unlocking Solo for them.
 */
export function replyEngagesQuestion(transcript: string): boolean {
  return ENGAGED_MATCH.test(transcript.toLowerCase())
}

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
