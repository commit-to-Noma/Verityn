import type { VerdictStatus } from '../api/client'

export const VERDICT_LABELS: Record<VerdictStatus, string> = {
  CONSISTENT: 'Your prediction matched the circuit result',
  CONTRADICTED: 'Your prediction did not match the circuit result',
  UNASSESSABLE: "Can't assess",
}
