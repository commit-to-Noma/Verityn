export interface TerminalNode {
  id: string
}

export interface TerminalEdge {
  source: string
  sourceHandle: string | null
  target: string
  targetHandle: string | null
}

/** Return the component terminals that do not yet have a wire attached. */
export function openTerminals(nodes: TerminalNode[], edges: TerminalEdge[]): string[] {
  const connected = new Set<string>()
  for (const edge of edges) {
    if (edge.sourceHandle !== null) {
      connected.add(`${edge.source}.${edge.sourceHandle}`)
    }
    if (edge.targetHandle !== null) {
      connected.add(`${edge.target}.${edge.targetHandle}`)
    }
  }
  return nodes.flatMap((node) =>
    (['a', 'b'] as const)
      .map((terminal) => `${node.id}.${terminal}`)
      .filter((terminal) => !connected.has(terminal)),
  )
}
