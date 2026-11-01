import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TraceInput } from '../lessons/trace'
import type { ChapterRecap } from '../journey/story'
import EvidenceCard from './EvidenceCard'

describe('EvidenceCard', () => {
  it('states its purpose as a shareable session record', () => {
    const chapter: ChapterRecap = {
      id: 'L1',
      title: 'Light the bulb',
      solo: false,
      input: {
        prediction: null,
        question: '',
        netlist: null,
        result: null,
        verdict: null,
        expectedLit: null,
        coach: null,
        coachAvailable: false,
      } satisfies TraceInput,
    }

    const markup = renderToStaticMarkup(
      <EvidenceCard chapters={[chapter]} />,
    )

    expect(markup).toContain('A shareable record of this session.')
  })
})
