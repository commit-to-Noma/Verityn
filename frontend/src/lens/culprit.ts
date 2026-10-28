import type { Netlist, SimulateResult, VerdictStatus } from '../api/client'
import { LIT_POWER_W } from '../lessons/lesson'

/** Solver-derived culprit for a contradicted lens prediction.
 *
 * Returns the open switch id when the bulb is dark and a switch in
 * the solved netlist is open; otherwise null. A wrong prediction
 * about a healthy circuit names no culprit.
 */
export function lensCulprit(
  netlist: Netlist,
  result: SimulateResult,
  status: VerdictStatus,
  bulbId: string,
): string | null {
  if (status !== 'CONTRADICTED' || !result.ok) {
    return null
  }
  if ((result.components[bulbId]?.power ?? 0) > LIT_POWER_W) {
    return null
  }
  return (
    netlist.components.find(
      (component) => component.type === 'switch' && component.closed === false,
    )?.id ?? null
  )
}
