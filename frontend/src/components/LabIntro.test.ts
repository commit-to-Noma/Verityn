import { describe, expect, it } from 'vitest'
import {
  HOMEPAGE_ENTRIES,
  HOMEPAGE_HEADLINE,
  HOMEPAGE_SUBHEAD,
  LABORATORY_STATIONS,
  STEM_FIELDS,
} from '../content/homepage'

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
      demo: 'Play the guided demo',
      laboratory: 'Explore the laboratory',
      realityLens: 'Open Reality Lens',
    })
  })

  it('offers a clear, real guided demo from the homepage', () => {
    expect(HOMEPAGE_ENTRIES.demo).toBe('Play the guided demo')
  })
})
