import { describe, expect, test } from 'vitest'
import { VERDICT_LABELS } from './verdictLabels'

describe('VERDICT_LABELS', () => {
  test('uses learner-facing wording, never model-as-authority', () => {
    expect(VERDICT_LABELS.CONSISTENT).toBe('Your prediction matched the circuit result')
    expect(VERDICT_LABELS.CONTRADICTED).toBe('Your prediction did not match the circuit result')
    expect(VERDICT_LABELS.UNASSESSABLE).toBe("Can't assess")
  })

  test('no label frames the model as the authority', () => {
    for (const label of Object.values(VERDICT_LABELS)) {
      expect(label.toLowerCase()).not.toContain('model')
      expect(label).not.toContain('Contradict')
    }
  })
})
