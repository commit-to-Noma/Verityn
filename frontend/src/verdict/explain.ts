/** One honest "why" sentence for a lit-claim verdict.
 *
 * Derived only from solver output plus netlist facts: an open switch
 * found in the built circuit explains a dark bulb; a lit bulb means
 * the loop carries current to it. When no cause is established, the
 * explainer stays silent (null) instead of inventing one.
 */

import type { Netlist } from '../api/client'
import { LIT_POWER_W } from '../lessons/lesson'

export function explainLitVerdict(args: {
  status: 'CONSISTENT' | 'CONTRADICTED'
  component: string
  predictedLit: boolean
  power: number
  netlist: Netlist
}): string | null {
  if (args.status === 'CONSISTENT') {
    return null
  }
  const lit = args.power > LIT_POWER_W
  if (args.predictedLit && !lit) {
    const open = args.netlist.components
      .filter((part) => part.type === 'switch' && part.closed === false)
      .map((part) => part.id)
    if (open.length === 0) {
      return null
    }
    return open.length === 1
      ? 'The bulb stayed dark because the open switch left a gap in the loop.'
      : 'The bulb stayed dark because open switches left gaps in the loop.'
  }
  if (!args.predictedLit && lit) {
    return 'The bulb lit because the completed loop carries current to it.'
  }
  return null
}
