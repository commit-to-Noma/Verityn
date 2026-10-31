import { describe, expect, it } from 'vitest'
import { acceptPointer, sketchExportSize, sketchReducer, SKETCH_EXPORT_WIDTH } from './strokes'

describe('sketchReducer', () => {
  it('appends strokes, drops empty ones, undoes one at a time, and clears', () => {
    const first = { points: [{ x: 1, y: 2 }], erase: false }
    const second = { points: [{ x: 3, y: 4 }], erase: true }
    let strokes = sketchReducer([], { type: 'stroke', stroke: first })
    strokes = sketchReducer(strokes, { type: 'stroke', stroke: { points: [], erase: false } })
    expect(strokes).toHaveLength(1)
    strokes = sketchReducer(strokes, { type: 'stroke', stroke: second })
    expect(strokes).toHaveLength(2)
    strokes = sketchReducer(strokes, { type: 'undo' })
    expect(strokes).toEqual([first])
    strokes = sketchReducer(strokes, { type: 'undo' })
    expect(strokes).toEqual([])
    strokes = sketchReducer(strokes, { type: 'undo' })
    expect(strokes).toEqual([])
    strokes = sketchReducer([first, second], { type: 'clear' })
    expect(strokes).toEqual([])
  })
})

describe('acceptPointer', () => {
  it('accepts everything unless pen-only is on', () => {
    expect(acceptPointer('touch', false)).toBe(true)
    expect(acceptPointer('mouse', false)).toBe(true)
    expect(acceptPointer('pen', true)).toBe(true)
    expect(acceptPointer('touch', true)).toBe(false)
    expect(acceptPointer('mouse', true)).toBe(false)
  })
})

describe('sketchExportSize', () => {
  it('exports 1024 wide with the source aspect preserved', () => {
    expect(sketchExportSize(800, 600)).toEqual({ width: 1024, height: 768 })
    expect(SKETCH_EXPORT_WIDTH).toBe(1024)
  })

  it('falls back to a square when geometry is invalid', () => {
    expect(sketchExportSize(0, 600)).toEqual({ width: 1024, height: 1024 })
    expect(sketchExportSize(800, Number.NaN)).toEqual({ width: 1024, height: 1024 })
  })
})
