import type { VerdictStatus } from '../api/client'

export const VERDICT_LABELS: Record<VerdictStatus, string> = {
  CONSISTENT: 'Consistent with the model',
  CONTRADICTED: 'Contradicted by the model',
  UNASSESSABLE: "Can't assess",
}
