import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LensSample } from '../lens/samples'
import LensFilmstrip from './LensFilmstrip'

const SAMPLES = [
  { id: 'textbook-loop', title: 'Textbook loop', image: 'loop.png' },
  { id: 'open-switch-loop', title: 'Open switch', image: 'open.png' },
] as unknown as LensSample[]

function render(props: Partial<Parameters<typeof LensFilmstrip>[0]> = {}) {
  return renderToStaticMarkup(
    <LensFilmstrip
      samples={SAMPLES}
      activeSampleId={null}
      uploadImage={null}
      uploadActive={false}
      onSelectSample={() => {}}
      onSelectUpload={() => {}}
      {...props}
    />,
  )
}

describe('LensFilmstrip', () => {
  it('lists every sample with its level', () => {
    const markup = render()
    expect(markup).toContain('Textbook loop')
    expect(markup).toContain('Starter')
    expect(markup).toContain('Challenge')
  })

  it('marks the active sample and hides the upload slot without an upload', () => {
    const markup = render({ activeSampleId: 'textbook-loop' })
    expect(markup).toContain('data-filmstrip="textbook-loop"')
    expect(markup).toContain('aria-current="true"')
    expect(markup).not.toContain('Your diagram')
  })

  it('offers the upload beside the samples once one exists', () => {
    const markup = render({ uploadImage: 'upload.png', uploadActive: true })
    expect(markup).toContain('Your diagram')
    expect(markup).toContain('data-filmstrip="upload"')
  })
})
