/** Pure sketch-pad model: strokes, undo, pointer filtering, export geometry. */

export interface SketchPoint {
  x: number
  y: number
}

export interface SketchStroke {
  points: SketchPoint[]
  erase: boolean
}

export type SketchAction =
  | { type: 'stroke'; stroke: SketchStroke }
  | { type: 'undo' }
  | { type: 'clear' }

/** Append-only stroke history with undo; empty strokes are dropped. */
export function sketchReducer(strokes: SketchStroke[], action: SketchAction): SketchStroke[] {
  switch (action.type) {
    case 'stroke':
      return action.stroke.points.length === 0 ? strokes : [...strokes, action.stroke]
    case 'undo':
      return strokes.slice(0, -1)
    case 'clear':
      return []
  }
}

/** Pen-only mode accepts pen input; otherwise pen, touch, and mouse draw. */
export function acceptPointer(pointerType: string, penOnly: boolean): boolean {
  if (!penOnly) {
    return true
  }
  return pointerType === 'pen'
}

export const SKETCH_EXPORT_WIDTH = 1024

/** Export size: fixed width, source aspect preserved, never zero. */
export function sketchExportSize(
  width: number,
  height: number,
  targetWidth = SKETCH_EXPORT_WIDTH,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) {
    return { width: targetWidth, height: targetWidth }
  }
  return { width: targetWidth, height: Math.max(1, Math.round((targetWidth * height) / width)) }
}
