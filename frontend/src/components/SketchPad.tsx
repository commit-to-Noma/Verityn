import { useEffect, useRef, useState } from 'react'
import type { ImageGeometry } from '../canvas/layout'
import { acceptPointer, sketchExportSize, sketchReducer, type SketchStroke } from '../sketch/strokes'

const INK = '#0f172a'
const PAPER = '#ffffff'
const STROKE_WIDTH = 6

function paint(ctx: CanvasRenderingContext2D, strokes: SketchStroke[]): void {
  const { width, height } = ctx.canvas
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, width, height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = STROKE_WIDTH
  for (const stroke of strokes) {
    const [first, ...rest] = stroke.points
    if (first === undefined) {
      continue
    }
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = INK
    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    for (const point of rest) {
      ctx.lineTo(point.x, point.y)
    }
    // A tap with no drag still leaves a mark.
    if (rest.length === 0) {
      ctx.lineTo(first.x + 0.5, first.y + 0.5)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Draw a circuit by hand, export it into the vision flow. */
export default function SketchPad({
  onExport,
  onCancel,
}: {
  onExport: (image: string, size: ImageGeometry) => void
  onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [strokes, setStrokes] = useState<SketchStroke[]>([])
  const [erase, setErase] = useState(false)
  const [penOnly, setPenOnly] = useState(false)
  const active = useRef<SketchStroke | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas === null || ctx === null || canvas === undefined || ctx === undefined) {
      return
    }
    const scale = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    const box = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(box.width * scale))
    canvas.height = Math.max(1, Math.round(box.height * scale))
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    paint(ctx, strokes)
  }, [strokes])

  const point = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const drawTo = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const stroke = active.current
    if (canvas === null || canvas === undefined || ctx === null || ctx === undefined || stroke === null) {
      return
    }
    stroke.points.push(point(event))
    paint(ctx, [...strokes, stroke])
  }

  const exportSketch = (): void => {
    const canvas = canvasRef.current
    if (canvas === null || strokes.length === 0) {
      return
    }
    const size = sketchExportSize(canvas.clientWidth, canvas.clientHeight)
    const out = document.createElement('canvas')
    out.width = size.width
    out.height = size.height
    const ctx = out.getContext('2d')
    if (ctx === null) {
      return
    }
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, 0, 0, out.width, out.height)
    onExport(out.toDataURL('image/png'), size)
  }

  return (
    <div className="glass-panel flex flex-col gap-3 p-4">
      <p className="text-ink-muted text-sm">
        Draw a battery, switch, bulb and wires. Label values if you can.
      </p>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Circuit sketch pad"
        className="h-72 w-full touch-none rounded-[10px] border border-glass-border bg-white"
        onPointerDown={(event) => {
          if (event.pointerType === 'pen' && !penOnly) {
            setPenOnly(true)
          }
          if (!acceptPointer(event.pointerType, penOnly)) {
            return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          active.current = { points: [point(event)], erase }
        }}
        onPointerMove={(event) => {
          if (active.current !== null) {
            drawTo(event)
          }
        }}
        onPointerUp={(event) => {
          if (active.current !== null) {
            drawTo(event)
            setStrokes((current) => sketchReducer(current, { type: 'stroke', stroke: active.current ?? { points: [], erase } }))
            active.current = null
          }
        }}
        onPointerCancel={() => {
          active.current = null
        }}
      />
      <div className="flex flex-wrap items-center gap-3" role="toolbar" aria-label="Sketch tools">
        <button
          type="button"
          onClick={() => setErase(false)}
          aria-pressed={!erase}
          className={`min-h-[44px] rounded-[10px] border px-4 text-sm font-medium ${erase ? 'border-glass-border' : 'bg-flow text-on-accent border-transparent'}`}
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => setErase(true)}
          aria-pressed={erase}
          className={`min-h-[44px] rounded-[10px] border px-4 text-sm font-medium ${erase ? 'bg-flow text-on-accent border-transparent' : 'border-glass-border'}`}
        >
          Eraser
        </button>
        <button
          type="button"
          onClick={() => setStrokes((current) => sketchReducer(current, { type: 'undo' }))}
          disabled={strokes.length === 0}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => setStrokes((current) => sketchReducer(current, { type: 'clear' }))}
          disabled={strokes.length === 0}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:opacity-40"
        >
          Clear
        </button>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={penOnly}
            onChange={(event) => setPenOnly(event.target.checked)}
            className="h-5 w-5"
          />
          Pen only
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={exportSketch}
          disabled={strokes.length === 0}
          className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium disabled:opacity-40"
        >
          Use sketch
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
        >
          Back to upload
        </button>
      </div>
    </div>
  )
}
