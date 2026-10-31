import type { SimulateResult } from '../api/client'

/** The triptych appears only after confirm plus a fresh solver run. */
export function showTriptych(
  confirmed: boolean,
  result: SimulateResult | null,
): boolean {
  return confirmed && result !== null
}

/** Panel 3 shows measurements or the validator's rejection, never both. */
export function resultPanel(result: SimulateResult): 'numbers' | 'invalid' {
  return result.ok ? 'numbers' : 'invalid'
}
