import { describe, expect, it } from 'vitest'
import { HOMEPAGE_ENTRIES, HOMEPAGE_HEADLINE, HOMEPAGE_SUBHEAD } from '../content/homepage'

describe('homepage copy', () => {
  it('leads with the laboratory headline', () => {
    expect(HOMEPAGE_HEADLINE).toBe('Make a prediction. Meet reality.')
  })

  it('keeps the honest simulator-determines-what-happened subhead', () => {
    expect(HOMEPAGE_SUBHEAD).toContain('Verityn\u2019s simulator determines what happened.')
  })

  it('exposes both entries plus the quiet demo link', () => {
    expect(HOMEPAGE_ENTRIES).toEqual({
      guidedLab: 'Enter the guided lab',
      realityLens: 'Open Reality Lens',
      demo: 'Watch the guided demo',
    })
  })

  it('never promises a timed video demo it does not have', () => {
    expect(HOMEPAGE_ENTRIES.demo).not.toContain('60-second')
  })
})
