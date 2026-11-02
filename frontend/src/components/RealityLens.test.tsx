import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LENS_SAMPLES } from '../lens/samples'
import RealityLens from './RealityLens'

describe('RealityLens sample segments', () => {
  it('offers tappable saved battery and bulb points without claiming live SAM', () => {
    const sample = LENS_SAMPLES.find((entry) => entry.id === 'textbook-loop')
    if (!sample) throw new Error('textbook-loop sample missing')
    const markup = renderToStaticMarkup(<RealityLens sample={sample} onBack={vi.fn()} />)

    expect(markup).toContain('data-segment="battery"')
    expect(markup).toContain('data-segment="bulb"')
    expect(markup).toContain('aria-label="Battery sample segment"')
    expect(markup).toContain('Tap a highlighted point to name that saved segment.')
    expect(markup).toContain('no live SAM call is made')
  })
})
