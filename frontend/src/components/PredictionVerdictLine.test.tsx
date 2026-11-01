import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PredictionVerdictLine from './PredictionVerdictLine'

describe('PredictionVerdictLine', () => {
  it('states the prediction beside the measured dark result without judging the learner', () => {
    const markup = renderToStaticMarkup(
      <PredictionVerdictLine
        choice="yes"
        current={0}
        power={0}
        lit={false}
      />,
    )

    expect(markup).toContain(
      'You predicted Yes. The solver measured <span class="font-mono tabular-nums">0 A</span> and <span class="font-mono tabular-nums">0 W</span> for the bulb, so it stayed dark. This tests your prediction against the model, not you.',
    )
  })

  it('uses the supplied component label and light state', () => {
    const markup = renderToStaticMarkup(
      <PredictionVerdictLine
        choice="no"
        current={0.6}
        power={3.6}
        lit
        component="the second bulb"
      />,
    )

    expect(markup).toContain('You predicted No.')
    expect(markup).toContain('0.6 A')
    expect(markup).toContain('3.6 W')
    expect(markup).toContain('for the second bulb, so it lit.')
  })
})
