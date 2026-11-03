import type { ImageGeometry } from '../canvas/layout'

/** 90° clockwise dimension swap; four turns return to the start. */
export function rotatedSize(size: ImageGeometry): ImageGeometry {
  return { width: size.height, height: size.width }
}

/** Rotate a data-URL image one quarter turn clockwise via canvas. */
export function rotateImageQuarterTurn(
  image: string,
  size: ImageGeometry,
): Promise<{ image: string; size: ImageGeometry }> {
  return new Promise((resolve, reject) => {
    const probe = new Image()
    probe.onload = () => {
      const out = document.createElement('canvas')
      out.width = size.height
      out.height = size.width
      const ctx = out.getContext('2d')
      if (ctx === null) {
        reject(new Error('Could not rotate that image.'))
        return
      }
      ctx.translate(out.width / 2, out.height / 2)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(probe, -size.width / 2, -size.height / 2, size.width, size.height)
      resolve({ image: out.toDataURL('image/png'), size: rotatedSize(size) })
    }
    probe.onerror = () => reject(new Error('Could not rotate that image.'))
    probe.src = image
  })
}
