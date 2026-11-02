import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Edge } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import '@xyflow/react/dist/style.css'
import type { CSSProperties } from 'react'
import type { SimulateResult } from '../api/client'
import type { LessonSeed } from '../lessons/lesson'
import { LIT_POWER_W } from '../lessons/lesson'
import type { CircuitNodeType } from './canvas/CircuitNode'
import { circuitNodeTypes } from './canvas/nodeTypes'

const FLOW_EDGE_STYLE: CSSProperties = { strokeWidth: 2, stroke: 'var(--color-flow)' }

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 640
}

function FitPreviewOnResize({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    let frame = 0
    const refit = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const mobile = window.innerWidth <= 640
        void fitView({
          padding: mobile ? 0.35 : 0.2,
          minZoom: mobile ? 0.25 : 0.5,
          maxZoom: 1,
        })
      })
    }
    const container = containerRef.current
    const observer =
      container !== null && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(refit)
        : null
    if (container !== null) {
      observer?.observe(container)
    }
    window.addEventListener('resize', refit)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', refit)
      window.cancelAnimationFrame(frame)
    }
  }, [containerRef, fitView])

  return null
}

function isCircuitKind(kind: string): kind is 'battery' | 'bulb' | 'switch' {
  return kind === 'battery' || kind === 'bulb' || kind === 'switch'
}

/** Read-only circuit display for lesson packs. No palette, no wiring, no run. */
export default function CircuitPreview({
  seed,
  label,
  result,
  className = 'h-64',
}: {
  seed: LessonSeed
  label: string
  result?: SimulateResult | null
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wired = new Set(
    seed.edges.flatMap((edge) => [
      `${edge.source}:${edge.sourceTerminal}`,
      `${edge.target}:${edge.targetTerminal}`,
    ]),
  )
  const measurementFor = (node: (typeof seed.nodes)[number]) => {
    const measurement = result?.components[node.id]
    if (measurement === undefined || node.kind !== 'battery') {
      return measurement
    }
    return {
      ...measurement,
      current: Math.abs(measurement.current),
      power: Math.abs(measurement.power),
    }
  }
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
        loose: (['a', 'b'] as const).filter(
          (terminal) => !wired.has(`${node.id}:${terminal}`),
        ),
        glow:
          node.kind === 'bulb' &&
          (result?.components[node.id]?.power ?? 0) > LIT_POWER_W
            ? 1
            : 0,
        invalid: false,
        closed: node.kind === 'switch' ? (node.closed ?? true) : true,
        readOnly: true,
        measurement: measurementFor(node),
      },
    }))
  const edges: Edge[] = seed.edges.map((edge) => ({
    id: edge.id,
    type: 'smoothstep',
    source: edge.source,
    sourceHandle: edge.sourceTerminal,
    target: edge.target,
    targetHandle: edge.targetTerminal,
    style: FLOW_EDGE_STYLE,
  }))
  return (
    <div ref={containerRef} className={`canvas-grid border-glass-border overflow-hidden rounded-2xl border ${className}`}>
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
          minZoom={isMobileViewport() ? 0.25 : 0.5}
          fitViewOptions={{
            padding: 0.35,
            minZoom: isMobileViewport() ? 0.25 : 0.5,
            maxZoom: 1,
          }}
          colorMode="dark"
          aria-label={label}
        >
          <FitPreviewOnResize containerRef={containerRef} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
