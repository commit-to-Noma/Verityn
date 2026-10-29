import { describe, expect, test } from 'vitest'
import { VISION_MAX_IMAGE_BYTES } from '../api/client'
import { LENS_ACCEPT, validateLensFile } from './upload'

describe('validateLensFile', () => {
  test('accepts PNG, JPEG, and WebP by MIME type', () => {
    expect(validateLensFile({ name: 'diagram.bin', type: 'image/png', size: 10 })).toEqual({ ok: true })
    expect(validateLensFile({ name: 'diagram.bin', type: 'image/jpeg', size: 10 })).toEqual({ ok: true })
    expect(validateLensFile({ name: 'diagram.bin', type: 'image/webp', size: 10 })).toEqual({ ok: true })
  })

  test('accepts a valid extension when the browser reports an empty MIME type', () => {
    for (const name of ['diagram.png', 'diagram.JPG', 'diagram.jpeg', 'diagram.WebP']) {
      expect(validateLensFile({ name, type: '', size: 10 })).toEqual({ ok: true })
    }
  })

  test('rejects unknown types and extensions', () => {
    expect(validateLensFile({ name: 'notes.txt', type: '', size: 10 })).toEqual({
      ok: false,
      message: 'Use a PNG, JPEG, or WebP image.',
    })
    expect(validateLensFile({ name: 'diagram.svg', type: 'image/svg+xml', size: 10 }).ok).toBe(false)
    expect(validateLensFile({ name: 'noextension', type: '', size: 10 }).ok).toBe(false)
  })

  test('rejects files over 4 MB even with a valid type', () => {
    const verdict = validateLensFile({
      name: 'diagram.png',
      type: 'image/png',
      size: VISION_MAX_IMAGE_BYTES + 1,
    })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error('expected a rejection')
    expect(verdict.message).toContain('too large')
    expect(validateLensFile({ name: 'diagram.png', type: 'image/png', size: VISION_MAX_IMAGE_BYTES })).toEqual({
      ok: true,
    })
  })

  test('file input accept string covers MIME types and extensions', () => {
    expect(LENS_ACCEPT).toContain('.png')
    expect(LENS_ACCEPT).toContain('.jpg')
    expect(LENS_ACCEPT).toContain('.jpeg')
    expect(LENS_ACCEPT).toContain('.webp')
    expect(LENS_ACCEPT).toContain('image/png')
    expect(LENS_ACCEPT).toContain('image/jpeg')
    expect(LENS_ACCEPT).toContain('image/webp')
  })
})
