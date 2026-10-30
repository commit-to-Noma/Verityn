import { describe, expect, it } from 'vitest'
import {
  HOMEPAGE_ENTRIES,
  HOMEPAGE_FIRST_LAB,
  HOMEPAGE_HEADLINE,
  HOMEPAGE_SUBHEAD,
} from '../content/homepage'

describe('homepage copy', () => {
  it('leads with the laboratory headline', () => {
    expect(HOMEPAGE_HEADLINE).toBe('Turn questions into experiments.')
  })

  it('keeps the honest predict-build-evidence subhead', () => {
    expect(HOMEPAGE_SUBHEAD).toContain('let evidence change your mind')
  })

  it('names circuits as the first lab without claiming future labs', () => {
    expect(HOMEPAGE_FIRST_LAB).toContain('Circuits are where Verityn begins')
    expect(HOMEPAGE_FIRST_LAB).not.toContain('now supports biology')
  })

  it('exposes guided, explore, lens, and demo entries', () => {
    expect(HOMEPAGE_ENTRIES).toEqual({
      guidedLab: 'Enter the Guided Lab',
      explore: 'Explore the Laboratory',
      realityLens: 'Open Reality Lens',
      demo: 'Watch the guided demo',
    })
  })

  it('never promises a timed video demo it does not have', () => {
    expect(HOMEPAGE_ENTRIES.demo).not.toContain('60-second')
  })
})
