import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import type { Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { CSSProperties } from 'react'
import type { LessonSeed } from '../lessons/lesson'
import type { CircuitNodeType } from './canvas/CircuitNode'
import { circuitNodeTypes } from './canvas/nodeTypes'

const FLOW_EDGE_STYLE: CSSProperties = { strokeWidth: 2, stroke: 'var(--color-flow)' }

function isCircuitKind(kind: string): kind is 'battery' | 'bulb' | 'switch' {
  return kind === 'battery' || kind === 'bulb' || kind === 'switch'
}

/** Read-only circuit display for lesson packs. No palette, no wiring, no run. */
export default function CircuitPreview({ seed, label }: { seed: LessonSeed; label: string }) {
  const nodes: CircuitNodeType[] = seed.nodes
    .filter((node): node is typeof node & { kind: 'battery' | 'bulb' | 'switch' } =>
      isCircuitKind(node.kind),
    )
    .map((node) => ({
      id: node.id,
      type: 'circuit',
      position: { x: node.x, y: node.y },
      data: {
        kind: node.kind,
        label: node.id,
        lit: false,
        invalid: false,
        closed: node.kind === 'switch' ? (node.closed ?? true) : true,
        readOnly: true,
      },
    }))
  const edges: Edge[] = seed.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceTerminal,
    target: edge.target,
    targetHandle: edge.targetTerminal,
    style: FLOW_EDGE_STYLE,
  }))

  return (
    <div className="canvas-grid border-glass-border h-64 overflow-hidden rounded-2xl border">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={circuitNodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          panOnDrag={false}
          fitView
          colorMode="dark"
          aria-label={label}
        />
      </ReactFlowProvider>
    </div>
  )
}
