import { describe, expect, it } from 'vitest'
import { rotatedSize } from './straighten'

describe('rotatedSize', () => {
  it('swaps width and height for one quarter turn', () => {
    expect(rotatedSize({ width: 800, height: 600 })).toEqual({ width: 600, height: 800 })
  })

  it('returns to the start after four turns', () => {
    const size = { width: 800, height: 600 }
    expect(rotatedSize(rotatedSize(rotatedSize(rotatedSize(size))))).toEqual(size)
  })
})
