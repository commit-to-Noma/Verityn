import type { TerminalNode } from './openTerminals'

const PART_NAMES: Record<string, string> = {
  battery: 'battery',
  bulb: 'bulb',
  switch: 'switch',
}

const ORDINALS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

export interface GuidanceNode extends TerminalNode {
  kind: string
}

function describeTerminal(terminal: string, nodes: GuidanceNode[]): string {
  const separator = terminal.lastIndexOf('.')
  if (separator <= 0) {
    return 'loose connection dot'
  }
  const id = terminal.slice(0, separator)
  const side = terminal.slice(separator + 1)
  const node = nodes.find((candidate) => candidate.id === id)
  if (node === undefined || (side !== 'a' && side !== 'b')) {
    return 'loose connection dot'
  }
  const name = PART_NAMES[node.kind]
  if (name === undefined) {
    return 'loose connection dot'
  }
  const suffix = /^([A-Z]+)(\d+)$/.exec(id)
  const matchingParts = nodes.filter((candidate) => candidate.kind === node.kind)
  const ordinal =
    matchingParts.length > 1 && suffix !== null
      ? ORDINALS[Number(suffix[2])]
      : undefined
  const partName = ordinal === undefined ? name : `${ordinal} ${name}`
  return `${partName}'s ${side === 'a' ? 'left' : 'right'} dot`
}

/** Stuck-helper: on stages that test the open switch, name the closed switch
 * instead of letting a flipped verdict confuse the learner. */
export function closedSwitchNotice(
  switches: { id: string; closed: boolean }[],
  expectSwitchOpen: boolean,
  runDone: boolean,
  demonstrationActive: boolean,
): string | null {
  if (!expectSwitchOpen || !runDone || demonstrationActive) {
    return null
  }
  const closed = switches.find((sw) => sw.closed)
  if (closed === undefined) {
    return null
  }
  return 'The switch is closed, but this challenge uses it open. Open the switch and test again to compare with your prediction.'
}

export function nextTerminalInstruction(terminals: string[], nodes: GuidanceNode[]): string {
  const descriptions = terminals.map((terminal) => describeTerminal(terminal, nodes))
  if (descriptions.length === 2) {
    return `Drag from the ${descriptions[0]} to the ${descriptions[1]}.`
  }
  if (descriptions.length > 0) {
    return 'Connect the loose dots to complete the loop.'
  }
  return ''
}
