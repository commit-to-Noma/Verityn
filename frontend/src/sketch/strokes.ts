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
  | { type: 'strokes'; strokes: SketchStroke[] }
  | { type: 'undo' }
  | { type: 'clear' }

/** Append-only stroke history with undo; empty strokes are dropped. */
export function sketchReducer(strokes: SketchStroke[], action: SketchAction): SketchStroke[] {
  switch (action.type) {
    case 'stroke':
      return action.stroke.points.length === 0 ? strokes : [...strokes, action.stroke]
    case 'strokes': {
      const kept = action.strokes.filter((stroke) => stroke.points.length > 0)
      return kept.length === 0 ? strokes : [...strokes, ...kept]
    }
    case 'undo':
      return strokes.slice(0, -1)
    case 'clear':
      return []
  }
}

/** Insulated Trace Mode: fresh ink closer than this to existing ink is trimmed. */
export const INSULATED_TRACE_RADIUS_PX = 8

function nearAny(point: SketchPoint, others: SketchStroke[], radius: number): boolean {
  for (const stroke of others) {
    for (const other of stroke.points) {
      const dx = point.x - other.x
      const dy = point.y - other.y
      if (dx * dx + dy * dy < radius * radius) {
        return true
      }
    }
  }
  return false
}

/**
 * Split a fresh draw stroke where it enters the insulation buffer around
 * existing ink. Kept runs become segments; trimmed points come back as
 * collisions so the pad can flash where the shield fired. Eraser strokes
 * pass through untouched.
 */
export function splitStrokeByOverlap(
  existing: SketchStroke[],
  stroke: SketchStroke,
  radius: number = INSULATED_TRACE_RADIUS_PX,
): { segments: SketchPoint[][]; collisions: SketchPoint[] } {
  if (stroke.erase || radius <= 0) {
    return { segments: stroke.points.length > 0 ? [stroke.points] : [], collisions: [] }
  }
  const segments: SketchPoint[][] = []
  const collisions: SketchPoint[] = []
  let run: SketchPoint[] = []
  for (const point of stroke.points) {
    if (nearAny(point, existing, radius)) {
      collisions.push(point)
      if (run.length > 0) {
        segments.push(run)
        run = []
      }
    } else {
      run.push(point)
    }
  }
  if (run.length > 0) {
    segments.push(run)
  }
  return { segments, collisions }
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
