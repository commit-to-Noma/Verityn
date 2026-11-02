import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createPrediction } from '../lessons/lesson'
import PredictionSummary from './PredictionSummary'

describe('PredictionSummary', () => {
  it('shows the recorded reason cleaned of fillers and repeats', () => {
    const markup = renderToStaticMarkup(
      <PredictionSummary
        prediction={createPrediction('L1T1', 'yes', 'Um, the the loop is closed.')}
        hint="hint"
        compact
      />,
    )

    expect(markup).toContain('“The loop is closed.”')
    expect(markup).not.toContain('Um,')
  })

  it('strips an echoed prompt when the question is provided', () => {
    const markup = renderToStaticMarkup(
      <PredictionSummary
        prediction={createPrediction('L1T1', 'yes', 'Will the bulb light? Yes, hopefully.')}
        hint="hint"
        compact
        question="Will the bulb light?"
      />,
    )

    expect(markup).toContain('“Yes, hopefully.”')
    expect(markup).not.toContain('Will the bulb light? Yes')
  })
})
