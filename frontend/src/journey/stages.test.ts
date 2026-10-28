import { describe, expect, it } from 'vitest'
import type { JourneyState } from './stages'
import { PROGRESS_STEPS, progressIndex, stageFor } from './stages'

const BASE: JourneyState = {
  entered: false,
  l1Prediction: false,
  twistStarted: false,
  twistPrediction: false,
  transferStarted: false,
  transferPrediction: false,
  transferDone: false,
}

describe('stageFor', () => {
  it('starts at the intro before entering the lab', () => {
    expect(stageFor(BASE)).toBe('intro')
  })

  it('walks the full guided journey in order', () => {
    expect(stageFor({ ...BASE, entered: true })).toBe('l1-predict')
    expect(stageFor({ ...BASE, entered: true, l1Prediction: true })).toBe('l1-build')
    expect(
      stageFor({ ...BASE, entered: true, l1Prediction: true, twistStarted: true }),
    ).toBe('twist-predict')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        twistStarted: true,
        twistPrediction: true,
      }),
    ).toBe('twist-build')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        twistStarted: true,
        twistPrediction: true,
        transferStarted: true,
      }),
    ).toBe('transfer-predict')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        twistStarted: true,
        twistPrediction: true,
        transferStarted: true,
        transferPrediction: true,
      }),
    ).toBe('transfer-build')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        twistStarted: true,
        twistPrediction: true,
        transferStarted: true,
        transferPrediction: true,
        transferDone: true,
      }),
    ).toBe('finale')
  })

  it('never skips ahead of the think-first gate', () => {
    // A later flag without its prediction still shows the earliest open stage.
    expect(stageFor({ ...BASE, entered: true, twistStarted: true })).toBe('l1-predict')
    expect(stageFor({ ...BASE, entered: true, transferStarted: true })).toBe('l1-predict')
    expect(
      stageFor({ ...BASE, entered: true, l1Prediction: true, transferStarted: true }),
    ).toBe('l1-build')
  })
})

describe('progressIndex', () => {
  it('maps every stage onto the four chapter steps', () => {
    expect(PROGRESS_STEPS).toEqual(['Predict', 'Build', 'Twist', 'Solo'])
    expect(progressIndex('intro')).toBe(-1)
    expect(progressIndex('l1-predict')).toBe(0)
    expect(progressIndex('l1-build')).toBe(1)
    expect(progressIndex('twist-predict')).toBe(2)
    expect(progressIndex('twist-build')).toBe(2)
    expect(progressIndex('transfer-predict')).toBe(3)
    expect(progressIndex('transfer-build')).toBe(3)
    expect(progressIndex('finale')).toBe(PROGRESS_STEPS.length)
  })
})
