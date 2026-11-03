import { describe, expect, it } from 'vitest'
import { LENS_SAMPLES } from './samples'
import { sampleSegmentCaption, sampleSegmentPoints, sampleSegmentSource } from './sampleSegments'

describe('sampleSegmentPoints', () => {
  it('places battery and bulb taps at their saved box centroids', () => {
    const sample = LENS_SAMPLES.find((entry) => entry.id === 'textbook-loop')
    if (!sample) throw new Error('textbook-loop sample missing')

    expect(sampleSegmentPoints(sample).map((point) => point.id)).toEqual(['battery', 'bulb'])
    const [battery, bulb] = sampleSegmentPoints(sample)
    expect(battery.xPct).toBeCloseTo(((174 + 209) / 2 / 687) * 100, 5)
    expect(battery.yPct).toBeCloseTo(((81 + 207) / 2 / 291) * 100, 5)
    expect(bulb.xPct).toBeCloseTo(((419 + 505) / 2 / 687) * 100, 5)
    expect(bulb.yPct).toBeCloseTo(((123 + 173) / 2 / 291) * 100, 5)
  })

  it('names SAM 3.1-sample provenance for captures and hand placement for rehearsals', () => {
    const verified = LENS_SAMPLES.find((entry) => entry.id === 'textbook-loop')
    const drawn = LENS_SAMPLES.find((entry) => entry.id === 'low-voltage-loop')
    if (!verified || !drawn) throw new Error('lens samples missing')

    expect(sampleSegmentSource(verified)).toBe('sam-sample')
    expect(sampleSegmentSource(drawn)).toBe('hand-placed')
    const [battery] = sampleSegmentPoints(verified)
    const [rehearsal] = sampleSegmentPoints(drawn)
    expect(sampleSegmentCaption(battery)).toBe('Battery sample segment · SAM 3.1 confidence 0.91')
    expect(sampleSegmentCaption(rehearsal)).toBe(
      'Battery sample segment · hand-placed rehearsal region',
    )
  })
})
