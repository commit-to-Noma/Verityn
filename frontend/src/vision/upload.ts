import { VISION_MAX_IMAGE_BYTES, VISION_MIME_TYPES } from '../api/client'

export const LENS_ACCEPT = [
  ...VISION_MIME_TYPES,
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
].join(',')

const LENS_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

export type LensFileProblem = { ok: false; message: string } | { ok: true }

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Validate a candidate diagram file before reading it.
 *
 * Some browsers report an empty MIME type for valid images, so a known file
 * extension also authorizes the upload. Anything else is rejected before any
 * network request can be made.
 */
export function validateLensFile(file: { name: string; type: string; size: number }): LensFileProblem {
  const byMime = VISION_MIME_TYPES.includes(file.type as (typeof VISION_MIME_TYPES)[number])
  const byExtension = LENS_EXTENSIONS.includes(extensionOf(file.name))
  if (!byMime && !byExtension) {
    return { ok: false, message: 'Use a PNG, JPEG, or WebP image.' }
  }
  if (file.size > VISION_MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `Image is too large (${formatBytes(file.size)}; max ${formatBytes(VISION_MAX_IMAGE_BYTES)}).`,
    }
  }
  return { ok: true }
}
