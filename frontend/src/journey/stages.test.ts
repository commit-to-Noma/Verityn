import { describe, expect, it } from 'vitest'
import type { JourneyState } from './stages'
import { PROGRESS_STEPS, progressIndex, stageFor } from './stages'

const BASE: JourneyState = {
  entered: false,
  l1Prediction: false,
  realityStarted: false,
  realityPrediction: false,
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
      stageFor({ ...BASE, entered: true, l1Prediction: true, realityStarted: true }),
    ).toBe('reality-predict')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        realityStarted: true,
        realityPrediction: true,
      }),
    ).toBe('reality-build')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        realityStarted: true,
        realityPrediction: true,
        transferStarted: true,
      }),
    ).toBe('transfer-predict')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        realityStarted: true,
        realityPrediction: true,
        transferStarted: true,
        transferPrediction: true,
      }),
    ).toBe('transfer-build')
    expect(
      stageFor({
        ...BASE,
        entered: true,
        l1Prediction: true,
        realityStarted: true,
        realityPrediction: true,
        transferStarted: true,
        transferPrediction: true,
        transferDone: true,
      }),
    ).toBe('finale')
  })

  it('never skips ahead of the think-first gate', () => {
    // A later flag without its prediction still shows the earliest open stage.
    expect(stageFor({ ...BASE, entered: true, realityStarted: true })).toBe('l1-predict')
    expect(stageFor({ ...BASE, entered: true, transferStarted: true })).toBe('l1-predict')
    expect(
      stageFor({ ...BASE, entered: true, l1Prediction: true, transferStarted: true }),
    ).toBe('l1-build')
  })
})

describe('progressIndex', () => {
  it('maps every stage onto the four chapter steps', () => {
    expect(PROGRESS_STEPS).toEqual(['Predict', 'Build', 'Reality Check', 'Solo'])
    expect(progressIndex('intro')).toBe(-1)
    expect(progressIndex('l1-predict')).toBe(0)
    expect(progressIndex('l1-build')).toBe(1)
    expect(progressIndex('reality-predict')).toBe(2)
    expect(progressIndex('reality-build')).toBe(2)
    expect(progressIndex('transfer-predict')).toBe(3)
    expect(progressIndex('transfer-build')).toBe(3)
    expect(progressIndex('finale')).toBe(PROGRESS_STEPS.length)
  })
})
