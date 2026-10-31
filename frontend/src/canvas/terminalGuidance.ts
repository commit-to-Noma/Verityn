import type { TerminalNode } from './openTerminals'

const PART_NAMES: Record<string, string> = {
  battery: 'Battery',
  bulb: 'Light',
  switch: 'Switch',
}

const ORDINALS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

export interface GuidanceNode extends TerminalNode {
  kind: string
}

function describeTerminal(terminal: string, nodes: GuidanceNode[]): string {
  const separator = terminal.lastIndexOf('.')
  if (separator <= 0) {
    return `terminal ${terminal}`
  }
  const id = terminal.slice(0, separator)
  const side = terminal.slice(separator + 1)
  const node = nodes.find((candidate) => candidate.id === id)
  if (node === undefined) {
    return `terminal ${terminal}`
  }
  const name = PART_NAMES[node.kind] ?? node.kind
  const suffix = /^([A-Z]+)(\d+)$/.exec(id)
  const number = suffix === null ? id : ORDINALS[Number(suffix[2])] ?? suffix[2]
  return `the ${side} terminal on ${name} ${number}`
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
  return `${closed.id} is closed, but this challenge tests the open switch. Open it and press Test again to compare with your prediction.`
}

export function nextTerminalInstruction(terminals: string[], nodes: GuidanceNode[]): string {
  const descriptions = terminals.map((terminal) => describeTerminal(terminal, nodes))
  if (descriptions.length === 2) {
    return `Next, connect ${descriptions[0]} to ${descriptions[1]}.`
  }
  if (descriptions.length > 0) {
    return `Open terminals: ${descriptions.join(', ')}. Connect the right terminals to complete the path.`
  }
  return ''
}
