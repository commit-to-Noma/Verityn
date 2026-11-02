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
      'You predicted Yes. You tested the circuit and the solver measured <span class="font-mono tabular-nums">0 A</span> and <span class="font-mono tabular-nums">0 W</span> for the bulb, so it stayed dark. That disagreed with your prediction: the loop is broken, so no current can reach the bulb.',
    )
    expect(markup).not.toContain('against the model, not you')
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
    expect(markup).toContain('That disagreed with your prediction')
  })

  it('gives unsure learners an answer instead of an agreement check', () => {
    const markup = renderToStaticMarkup(
      <PredictionVerdictLine
        choice="not_sure"
        current={0.6}
        power={3.6}
        lit
      />,
    )

    expect(markup).toContain('weren&#x27;t sure')
    expect(markup).toContain('Now you have your answer: the loop gives current a complete path')
  })
})
