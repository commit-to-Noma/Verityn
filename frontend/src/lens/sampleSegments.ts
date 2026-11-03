/** Saved Reality Lens segments as tappable sample points.
 *
 * These points only select regions already stored in the curated sample
 * pack. Spike captures reuse SAM 3.1 boxes from docs/sam-spike-results.json;
 * drawn rehearsals reuse hand-placed boxes. Tapping never calls SAM 3.1.
 */

import type { LensSample } from './samples'

export type SampleSegmentId = 'battery' | 'bulb'
export type SampleSegmentSource = 'sam-sample' | 'hand-placed'

export interface SampleSegmentPoint {
  id: SampleSegmentId
  label: string
  /** Centroid across the sample image, as CSS percentages. */
  xPct: number
  yPct: number
  confidence: number
  source: SampleSegmentSource
}

const SEGMENT_LABELS: Record<SampleSegmentId, string> = {
  battery: 'Battery',
  bulb: 'Bulb',
}

/** Spike captures live under the SAM 3.1 fixture directory; rehearsals do not. */
export function sampleSegmentSource(sample: LensSample): SampleSegmentSource {
  return sample.source.startsWith('tests/fixtures/sam_spike/') ? 'sam-sample' : 'hand-placed'
}

/** Battery and bulb centroids for the overlay, in display order. */
export function sampleSegmentPoints(sample: LensSample): SampleSegmentPoint[] {
  const source = sampleSegmentSource(sample)
  return (['battery', 'bulb'] as const).map((id) => {
    const box = sample.boxes[id]
    return {
      id,
      label: SEGMENT_LABELS[id],
      xPct: (((box.left + box.right) / 2 / sample.width) * 100),
      yPct: (((box.top + box.bottom) / 2 / sample.height) * 100),
      confidence: box.confidence,
      source,
    }
  })
}

/** Honest caption for a tapped point: provenance is always named. */
export function sampleSegmentCaption(point: SampleSegmentPoint): string {
  if (point.source === 'sam-sample') {
    return `${point.label} sample segment · SAM 3.1 confidence ${point.confidence.toFixed(2)}`
  }
  return `${point.label} sample segment · hand-placed rehearsal region`
}
