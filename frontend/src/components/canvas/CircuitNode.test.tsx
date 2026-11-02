import { ReactFlowProvider } from '@xyflow/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CircuitNode, { type CircuitNodeData } from './CircuitNode'

const data = (kind: CircuitNodeData['kind'], measurement?: CircuitNodeData['measurement']): CircuitNodeData => ({
  kind,
  label: kind === 'battery' ? 'B1' : 'L1',
  glow: 0,
  invalid: false,
  closed: true,
  measurement,
})

const nodeProps = {
  type: 'circuit' as const,
  dragging: false,
  zIndex: 0,
  selectable: false,
  deletable: false,
  selected: false,
  draggable: false,
  isConnectable: false,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
}

const markupFor = (id: string, node: CircuitNodeData): string =>
  renderToStaticMarkup(
    <ReactFlowProvider>
      <CircuitNode id={id} data={node} {...nodeProps} />
    </ReactFlowProvider>,
  )

describe('CircuitNode measurement', () => {
  it('shows battery delivery as supplied magnitudes, never negative', () => {
    const markup = markupFor('B1', data('battery', { voltage: 6, current: -1.2, power: -7.2 }))

    expect(markup).toContain('supplies 1.2 A (7.2 W)')
    expect(markup).not.toContain('-1.2 A')
    expect(markup).not.toContain('-7.2 W')
  })

  it('keeps bulb voltage, current, and power readings', () => {
    const markup = markupFor('L1', data('bulb', { voltage: 6, current: 0.6, power: 3.6 }))

    expect(markup).toContain('6.0 V')
    expect(markup).toContain('0.6 A')
    expect(markup).toContain('3.6 W')
  })
})
