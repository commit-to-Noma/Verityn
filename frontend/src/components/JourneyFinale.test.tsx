import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Netlist, SimulateResult } from '../api/client'
import type { TraceInput } from '../lessons/trace'
import { createPrediction } from '../lessons/lesson'
import type { ChapterRecap } from '../journey/story'
import JourneyFinale from './JourneyFinale'

const netlist: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'B1.a', b: 'B1.b' },
    { id: 'S1', type: 'switch', closed: false, a: 'S1.a', b: 'S1.b' },
    { id: 'L1', type: 'bulb', a: 'L1.a', b: 'L1.b' },
    { id: 'W1', type: 'wire', a: 'B1.a', b: 'S1.a' },
    { id: 'W2', type: 'wire', a: 'S1.b', b: 'L1.a' },
    { id: 'W3', type: 'wire', a: 'B1.b', b: 'L1.b' },
  ],
}

const result: SimulateResult = {
  ok: true,
  node_voltages: {},
  components: {
    B1: { voltage: 6, current: 0, power: 0 },
    S1: { voltage: 0, current: 0, power: 0 },
    L1: { voltage: 0, current: 0, power: 0 },
  },
  error_code: null,
  error_message: '',
  component_ids: [],
  conditions: {},
  ratings: {},
}

const chapter: ChapterRecap = {
  id: 'L1T1',
  title: 'Light the bulb',
  solo: false,
  input: {
    prediction: createPrediction('L1T1', 'no', 'The open switch stops the current.'),
    question: 'Will the bulb light?',
    netlist,
    result,
    verdict: null,
    expectedLit: null,
    coach: null,
    coachAvailable: false,
  } satisfies TraceInput,
}

describe('JourneyFinale', () => {
  it('offers the solved chapter circuit in Experiment Bay after the explanation', () => {
    const markup = renderToStaticMarkup(
      <JourneyFinale
        chapters={[chapter]}
        onReturnHub={vi.fn()}
        onExploreLens={vi.fn()}
        onTryExperiment={vi.fn()}
      />,
    )

    expect(markup).toContain('Explain with Muse Spark')
    expect(markup).toContain('Try it in the Experiment Bay')
    expect(markup).toContain('aria-label="Try Light the bulb in the Experiment Bay"')
  })
})
