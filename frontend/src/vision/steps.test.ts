import { describe, expect, it } from 'vitest'
import { LENS_STEP_LABELS, lensSteps } from './steps'

describe('lensSteps', () => {
  it('starts on upload before any proposal', () => {
    expect(lensSteps(false, false, false)).toEqual(['current', 'todo', 'todo'])
  })

  it('moves to review once a proposal exists', () => {
    expect(lensSteps(true, false, false)).toEqual(['done', 'current', 'todo'])
  })

  it('moves to confirm-and-simulate after confirmation', () => {
    expect(lensSteps(true, true, false)).toEqual(['done', 'done', 'current'])
  })

  it('completes all steps once the confirmed replica is tested', () => {
    expect(lensSteps(true, true, true)).toEqual(['done', 'done', 'done'])
  })

  it('labels the three documented stages', () => {
    expect([...LENS_STEP_LABELS]).toEqual([
      'Upload diagram',
      'Review detected circuit',
      'Confirm and simulate',
    ])
  })
})
