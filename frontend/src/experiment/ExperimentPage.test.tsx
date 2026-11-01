import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ExperimentPage from './ExperimentPage'

describe('ExperimentPage', () => {
  it('starts with the circuit passed from the Finale', () => {
    const markup = renderToStaticMarkup(
      <ExperimentPage
        initialLabel="Open switch from your journey"
        initialSeed={{
          nodes: [
            { id: 'B1', kind: 'battery', x: 80, y: 80 },
            { id: 'S1', kind: 'switch', closed: false, x: 340, y: 80 },
            { id: 'L1', kind: 'bulb', x: 340, y: 290 },
          ],
          edges: [
            { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
            { id: 'W2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
            { id: 'W3', source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
          ],
        }}
      />,
    )

    expect(markup).toContain('Loaded circuit: Open switch from your journey')
  })
})
