import { describe, expect, it } from 'vitest'
import {
  acceptPointer,
  INSULATED_TRACE_RADIUS_PX,
  sketchExportSize,
  sketchReducer,
  SKETCH_EXPORT_WIDTH,
  splitStrokeByOverlap,
} from './strokes'

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

describe('sketchReducer batch', () => {
  it('appends split segments in one dispatch, dropping empties', () => {
    const segments = [
      { points: [{ x: 1, y: 1 }], erase: false },
      { points: [], erase: false },
      { points: [{ x: 9, y: 9 }], erase: false },
    ]
    const strokes = sketchReducer([], { type: 'strokes', strokes: segments })
    expect(strokes).toHaveLength(2)
    expect(sketchReducer(strokes, { type: 'strokes', strokes: [] })).toHaveLength(2)
  })
})

describe('splitStrokeByOverlap', () => {
  const wall = { points: [{ x: 100, y: 100 }], erase: false }

  it('uses an 8 px insulation buffer', () => {
    expect(INSULATED_TRACE_RADIUS_PX).toBe(8)
  })

  it('keeps distant ink whole with no collisions', () => {
    const fresh = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      erase: false,
    }
    expect(splitStrokeByOverlap([wall], fresh)).toEqual({
      segments: [fresh.points],
      collisions: [],
    })
  })

  it('trims the overlapping middle into two segments and reports collisions', () => {
    const fresh = {
      points: [
        { x: 50, y: 100 },
        { x: 98, y: 100 },
        { x: 102, y: 100 },
        { x: 150, y: 100 },
      ],
      erase: false,
    }
    const { segments, collisions } = splitStrokeByOverlap([wall], fresh)
    expect(segments).toEqual([
      [{ x: 50, y: 100 }],
      [{ x: 150, y: 100 }],
    ])
    expect(collisions).toEqual([
      { x: 98, y: 100 },
      { x: 102, y: 100 },
    ])
  })

  it('drops a stroke drawn fully inside the buffer', () => {
    const fresh = {
      points: [
        { x: 99, y: 100 },
        { x: 101, y: 101 },
      ],
      erase: false,
    }
    const { segments, collisions } = splitStrokeByOverlap([wall], fresh)
    expect(segments).toEqual([])
    expect(collisions).toHaveLength(2)
  })

  it('leaves eraser strokes untouched', () => {
    const fresh = { points: [{ x: 100, y: 100 }], erase: true }
    expect(splitStrokeByOverlap([wall], fresh)).toEqual({
      segments: [[{ x: 100, y: 100 }]],
      collisions: [],
    })
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
