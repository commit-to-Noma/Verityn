import { describe, expect, it } from 'vitest'
import {
  HOMEPAGE_ENTRIES,
  HOMEPAGE_HEADLINE,
  HOMEPAGE_SUBHEAD,
  LAB_LOOP,
  LABORATORY_STATIONS,
  STEM_FIELDS,
} from '../content/homepage'
import { SMART_DETAILS } from '../content/intelligence'

describe('homepage copy', () => {
  it('leads with an idea that applies across STEM', () => {
    expect(HOMEPAGE_HEADLINE).toBe('Imagine it. Test it. Understand it.')
  })

  it('frames circuits as the first module, not the whole platform', () => {
    expect(HOMEPAGE_SUBHEAD).toContain('four STEM disciplines')
    expect(HOMEPAGE_SUBHEAD).toContain('first live Engineering module')
  })

  it('offers the four STEM disciplines and marks only Engineering live', () => {
    expect(STEM_FIELDS.map((field) => field.title)).toEqual([
      'Science',
      'Technology',
      'Engineering',
      'Mathematics',
    ])
    expect(STEM_FIELDS.filter((field) => field.status === 'live').map((field) => field.id)).toEqual([
      'engineering',
    ])
    expect(STEM_FIELDS.find((field) => field.id === 'science')?.description).toContain('simulated results')
    expect(STEM_FIELDS.find((field) => field.id === 'technology')?.description).toContain('repeated trials')
    expect(STEM_FIELDS.find((field) => field.id === 'mathematics')?.description).toContain('Change values')
  })

  it('keeps the feature turntable complete and removes redundant hero routes', () => {
    expect(LABORATORY_STATIONS.map((station) => station.id)).toEqual([
      'lab',
      'experiment',
      'lens',
      'coach',
      'solver',
    ])
    expect(HOMEPAGE_ENTRIES).toEqual({
      demo: 'Watch a walkthrough',
      startLab: 'Start your own lab',
      laboratory: 'Explore the laboratory',
      realityLens: 'Open Reality Lens',
    })
  })

  it('offers a clear, real guided demo from the homepage', () => {
    expect(HOMEPAGE_ENTRIES.demo).toBe('Watch a walkthrough')
    expect(HOMEPAGE_ENTRIES.startLab).toBe('Start your own lab')
  })

  it('uses plain-language guidance and solver-grounded wording', () => {
    expect(LABORATORY_STATIONS[0]?.details).toContain('Measured by the solver')
    expect(LAB_LOOP[3]?.doing).toBe(
      'Answer in your own words, then try it without the coach in Solo.',
    )
  })

  it('documents each smart behavior with a place to see it and evidence', () => {
    expect(SMART_DETAILS).toHaveLength(9)
    for (const detail of SMART_DETAILS) {
      expect(detail.where).not.toBe('')
      expect(detail.evidence).toMatch(/(test|trace)[^/]*\.(tsx?|py)$/)
    }
  })
})
