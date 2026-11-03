import { useEffect, useRef, useState } from 'react'
import type { ImageGeometry } from '../canvas/layout'
import {
  acceptPointer,
  sketchExportSize,
  sketchReducer,
  splitStrokeByOverlap,
  type SketchPoint,
  type SketchStroke,
} from '../sketch/strokes'

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
  const [insulated, setInsulated] = useState(true)
  const [collisions, setCollisions] = useState<(SketchPoint & { id: number })[]>([])
  const flashId = useRef(0)
  const active = useRef<SketchStroke | null>(null)
  const strokesRef = useRef<SketchStroke[]>([])
  strokesRef.current = strokes
  const batchRef = useRef(1)
  const flashTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current)
      }
    },
    [],
  )

  const flashCollisions = (points: SketchPoint[]): void => {
    if (points.length === 0) {
      return
    }
    // Cap the markers: a long graze flashes a trail, not a thousand dots.
    setCollisions(
      points.slice(0, 24).map((spot) => {
        flashId.current += 1
        return { ...spot, id: flashId.current }
      }),
    )
    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current)
    }
    flashTimer.current = window.setTimeout(() => setCollisions([]), 900)
  }

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
    paint(ctx, [...strokesRef.current, stroke])
    if (insulated && !stroke.erase && strokesRef.current.length > 0) {
      const { collisions: hits } = splitStrokeByOverlap(
        strokesRef.current,
        { points: stroke.points.slice(-1), erase: false },
      )
      if (hits.length > 0) {
        flashCollisions(hits)
      }
    }
  }

  const commitStroke = (): void => {
    const stroke = active.current
    if (stroke === null) {
      return
    }
    if (insulated && !stroke.erase && strokesRef.current.length > 0) {
      const { segments, collisions: hits } = splitStrokeByOverlap(strokesRef.current, stroke)
      batchRef.current = Math.max(1, segments.length)
      setStrokes((current) =>
        sketchReducer(
          current,
          { type: 'strokes', strokes: segments.map((points) => ({ points, erase: false })) },
        ),
      )
      flashCollisions(hits)
    } else {
      batchRef.current = 1
      setStrokes((current) => sketchReducer(current, { type: 'stroke', stroke }))
    }
    active.current = null
  }

  const undoBatch = (): void => {
    const steps = batchRef.current
    batchRef.current = 1
    setStrokes((current) => {
      let out = current
      for (let step = 0; step < steps; step += 1) {
        out = sketchReducer(out, { type: 'undo' })
      }
      return out
    })
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
      <div className="relative">
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
            commitStroke()
          }
        }}
        onPointerCancel={() => {
          active.current = null
        }}
      />
      {collisions.length > 0 && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {collisions.map((spot) => (
            <span key={spot.id} className="trace-collision" style={{ left: spot.x, top: spot.y }} />
          ))}
        </div>
      )}
      </div>
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
          onClick={undoBatch}
          disabled={strokes.length === 0}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => {
            batchRef.current = 1
            setStrokes((current) => sketchReducer(current, { type: 'clear' }))
          }}
          disabled={strokes.length === 0}
          className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setInsulated((current) => !current)}
          aria-pressed={insulated}
          title="Fresh ink within 8 px of existing ink is trimmed to prevent dead-shorts."
          className={`min-h-[44px] rounded-[10px] border px-4 text-sm font-medium ${insulated ? 'bg-flow text-on-accent border-transparent' : 'border-glass-border'}`}
        >
          Insulated traces
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
      {insulated && (
        <p className="text-ink-muted text-xs" role="note">
          <span aria-hidden="true">⚡ </span>Insulated Trace Mode active: wires drawn within 8 px
          of existing ink automatically clear the overlapping segment to prevent dead-shorts.
        </p>
      )}
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
