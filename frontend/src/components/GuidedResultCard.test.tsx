import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SimulateResult } from '../api/client'
import GuidedResultCard from './GuidedResultCard'

const solved = (bulb: { voltage: number; current: number; power: number }): SimulateResult => ({
  ok: true,
  node_voltages: { p: 6, '0': 0 },
  components: {
    B1: { voltage: 6, current: 0, power: 0 },
    L1: bulb,
  },
  error_code: null,
  error_message: '',
  component_ids: [],
  conditions: { B1: 'intact', L1: 'intact' },
  ratings: { L1: { rated_volts: 6, max_safe_watts: 6 } },
})

describe('GuidedResultCard', () => {
  it('shows solver readings for a lit bulb and keeps the workbench behind See details', () => {
    const markup = renderToStaticMarkup(
      <GuidedResultCard
        result={solved({ voltage: 6, current: 0.6, power: 3.6 })}
        onDetailsOpen={() => undefined}
      >
        <p>Detailed circuit</p>
      </GuidedResultCard>,
    )

    expect(markup).toContain('Battery voltage')
    expect(markup).toContain('6 V')
    expect(markup).toContain('0.6 A')
    expect(markup).toContain('3.6 W')
    expect(markup).not.toContain('The bulb lit; current flows around the completed loop.')
    expect(markup).toContain('<summary')
    expect(markup).toContain('See details')
    expect(markup).toContain('Detailed circuit')
    expect(markup).toContain('grid-cols-1')
  })

  it('uses the open-switch measurement to describe a dark bulb', () => {
    const markup = renderToStaticMarkup(
      <GuidedResultCard
        result={solved({ voltage: 0, current: 0, power: 0 })}
        onDetailsOpen={() => undefined}
      >
        <p>Detailed circuit</p>
      </GuidedResultCard>,
    )

    expect(markup).toContain('0 A')
    expect(markup).toContain('0 W')
    expect(markup).not.toContain('The bulb stayed off; the open switch breaks the loop.')
  })
})
