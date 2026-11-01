import type { ChapterRecap } from '../journey/story'
import { bulbReadingText, choiceDetail } from '../journey/story'
import { LIT_POWER_W } from '../lessons/lesson'
import type { TraceInput } from '../lessons/trace'

/** Shareable evidence card: session facts only, never scores or claims. */
export interface EvidenceCardModel {
  lesson: string
  prediction: string
  measurement: string
  /** First-chapter L1 lit state, from solver power only. */
  lit: boolean
  reality: string | null
  rung: string | null
  solo: string | null
  total: number
  metaCalls: number
  rejections: number
  fallbacks: number
  /** Distinct Meta tool short labels, first-seen order. */
  metaTools: string[]
  appUrl: string
}

export interface TraceCountInput {
  total: number
  metaCalls: number
  rejections: number
  fallbacks: number
  /** Raw trace tool ids in event order; non-Meta tools never chip. */
  tools: string[]
}

/** Short chip label for a Meta tool id, or null when it is not one. */
export function toolShortLabel(tool: string): string | null {
  if (tool.includes('voice-transcribe')) {
    return 'Voice'
  }
  if (tool.includes('muse-spark')) {
    return 'Spark'
  }
  if (tool.includes('sam-3.1')) {
    return 'SAM'
  }
  return null
}

/** Distinct Meta tool chips in first-seen order. */
export function metaToolChips(tools: string[]): string[] {
  const chips: string[] = []
  for (const tool of tools) {
    const label = toolShortLabel(tool)
    if (label !== null && !chips.includes(label)) {
      chips.push(label)
    }
  }
  return chips
}

/** Existing ladder stages only: R3 is not a product stage. */
export function rungLevel(rung: string | null): number {
  if (rung === null) {
    return 0
  }
  return RUNG_ORDER.indexOf(rung) + 1
}

const RUNG_ORDER = ['R1', 'R2', 'R4']
const RUNG_NAME: Record<string, string> = { R1: 'Question', R2: 'Pointer', R4: 'Demonstration' }

function rungReached(chapters: ChapterRecap[]): string | null {
  const rungs = new Set<string>()
  for (const chapter of chapters) {
    const coach = chapter.input?.coach
    if (coach !== null && coach !== undefined && coach.phase === 'done') {
      if (coach.rung !== undefined) {
        rungs.add(coach.rung)
      }
      for (const entry of coach.history ?? []) {
        rungs.add(entry.rung)
      }
    }
  }
  const known = [...rungs].filter((rung) => RUNG_ORDER.includes(rung))
  if (known.length === 0) {
    return null
  }
  return known.sort((a, b) => RUNG_ORDER.indexOf(a) - RUNG_ORDER.indexOf(b)).at(-1) ?? null
}

function verdictWord(status: string | undefined): string | null {
  if (status === 'CONSISTENT') {
    return 'matched'
  }
  if (status === 'CONTRADICTED') {
    return 'did not match'
  }
  return null
}

function readingLine(input: TraceInput, bulbId: string): string {
  const reading = bulbReadingText(input, bulbId)
  const word = verdictWord(input.verdict?.status)
  return word === null ? reading : `${reading} · ${word}`
}

/** Assemble the card from saved chapters; null when nothing was produced. */
export function buildEvidenceCard(
  chapters: ChapterRecap[],
  counts: TraceCountInput,
  appUrl: string,
  includeWhy = false,
): EvidenceCardModel | null {
  const first = chapters[0]
  if (first?.input == null) {
    return null
  }
  const soloChapter = chapters.find((chapter) => chapter.solo)
  const soloInput = soloChapter?.input ?? null
  const realityInput = chapters[1]?.input ?? null
  const firstPower = first.input.result?.components.L1?.power
  return {
    lesson: first.title,
    prediction: includeWhy ? choiceDetail(first) : choiceDetail(first).split('  -  ')[0],
    measurement: readingLine(first.input, 'L1'),
    lit: typeof firstPower === 'number' && firstPower > LIT_POWER_W,
    reality: realityInput === null ? null : readingLine(realityInput, 'L1'),
    rung: rungReached(chapters),
    solo:
      soloChapter !== undefined && soloInput !== null
        ? `${choiceDetail(soloChapter)} · ${readingLine(soloInput, 'L2')}`
        : null,
    total: counts.total,
    metaCalls: counts.metaCalls,
    rejections: counts.rejections,
    fallbacks: counts.fallbacks,
    metaTools: metaToolChips(counts.tools),
    appUrl,
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** Canvas text lines for the PNG export, in draw order. */
export function cardLines(model: EvidenceCardModel): string[] {
  return [
    `Verityn · ${model.lesson}`,
    model.prediction,
    `Measured: ${model.measurement}`,
    ...(model.reality === null ? [] : [`Reality check: ${model.reality}`]),
    model.rung === null ? 'Coach: not asked' : `Help reached: ${RUNG_NAME[model.rung] ?? model.rung}`,
    ...(model.solo === null ? [] : [`Solo: ${model.solo}`]),
    `Trace: ${plural(model.total, 'call')} · ${model.metaCalls} Meta · ${plural(model.rejections, 'rejection')} · ${plural(model.fallbacks, 'fallback')}`,
    'Computed by a solver. Not an AI score.',
    model.appUrl,
  ]
}

/** Greedy wrap for canvas fillText, which never wraps on its own. */
export function wrapLine(line: string, width = 52): string[] {
  const words = line.split(' ')
  const rows: string[] = []
  let row = ''
  for (const word of words) {
    const next = row === '' ? word : `${row} ${word}`
    if (next.length > width && row !== '') {
      rows.push(row)
      row = word
    } else {
      row = next
    }
  }
  if (row !== '') {
    rows.push(row)
  }
  return rows
}

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630

function loadLogo(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function roundPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

/** Miniature L1 loop: battery, bulb, and wires; glow follows solver power. */
function drawMiniCircuit(ctx: CanvasRenderingContext2D, x: number, y: number, lit: boolean): void {
  const width = 328
  const height = 300
  ctx.save()
  roundPanel(ctx, x, y, width, height, 18)
  ctx.fillStyle = '#111a30'
  ctx.fill()
  ctx.strokeStyle = '#26334d'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#94a3b8'
  ctx.font = '600 20px sans-serif'
  ctx.fillText('L1 RESULT', x + 24, y + 40)
  // Wire loop.
  ctx.strokeStyle = lit ? '#22d3ee' : '#475569'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.roundRect(x + 48, y + 64, width - 96, height - 128, 24)
  ctx.stroke()
  // Battery plates on the left side.
  const bx = x + 48
  const by = y + height / 2
  ctx.strokeStyle = '#f1f5f9'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(bx - 14, by - 26)
  ctx.lineTo(bx - 14, by + 26)
  ctx.moveTo(bx + 14, by - 12)
  ctx.lineTo(bx + 14, by + 12)
  ctx.stroke()
  // Bulb on the right side, glowing only when the solver says lit.
  const cx = x + width - 48
  const cy = y + height / 2
  if (lit) {
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 64)
    glow.addColorStop(0, 'rgba(251, 191, 36, 0.85)')
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, 64, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = lit ? '#fbbf24' : '#1e293b'
  ctx.beginPath()
  ctx.arc(cx, cy, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = lit ? '#fde68a' : '#475569'
  ctx.lineWidth = 4
  ctx.stroke()
  // Filament V.
  ctx.strokeStyle = lit ? '#78350f' : '#64748b'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(cx - 11, cy - 6)
  ctx.lineTo(cx, cy + 8)
  ctx.lineTo(cx + 11, cy - 6)
  ctx.stroke()
  ctx.restore()
}

/** Ladder dots for the three served stages. */
function drawRungDots(ctx: CanvasRenderingContext2D, x: number, y: number, rung: string | null): void {
  ctx.save()
  ctx.fillStyle = '#94a3b8'
  ctx.font = '600 20px sans-serif'
  ctx.fillText('HELP LADDER', x, y - 14)
  const level = rungLevel(rung)
  RUNG_ORDER.forEach((label, index) => {
    const cx = x + 14 + index * 44
    const cy = y + 22
    ctx.beginPath()
    ctx.arc(cx, cy, 11, 0, Math.PI * 2)
    if (index < level) {
      ctx.fillStyle = '#22d3ee'
      ctx.fill()
    } else {
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.fillStyle = '#94a3b8'
    ctx.font = '20px sans-serif'
    ctx.fillText(label, cx - 13, cy + 34)
  })
  ctx.fillStyle = '#f1f5f9'
  ctx.font = '24px sans-serif'
  ctx.fillText(rung === null ? 'Coach not asked' : `Reached ${RUNG_NAME[rung] ?? rung}`, x + 3 * 44 + 20, y + 30)
  ctx.restore()
}

/** One pill per Meta tool the session actually used; omitted when none. */
function drawMetaChips(ctx: CanvasRenderingContext2D, x: number, y: number, tools: string[]): number {
  if (tools.length === 0) {
    return x
  }
  ctx.save()
  ctx.font = '600 20px sans-serif'
  let cx = x
  for (const tool of tools) {
    const label = `Meta ${tool}`
    const width = ctx.measureText(label).width + 36
    roundPanel(ctx, cx, y, width, 38, 19)
    ctx.fillStyle = '#1e293b'
    ctx.fill()
    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#f1f5f9'
    ctx.fillText(label, cx + 18, y + 26)
    cx += width + 12
  }
  ctx.restore()
  return cx
}

/** Render the card to a PNG data URL entirely in the browser. */
export async function renderEvidencePng(
  model: EvidenceCardModel,
  logoUrl = '/brand/verityn-mark.svg',
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Canvas is unavailable.')
  }
  ctx.fillStyle = '#0d1424'
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.fillStyle = '#22d3ee'
  ctx.fillRect(0, 0, CARD_WIDTH, 10)
  const logo = await loadLogo(logoUrl)
  if (logo !== null) {
    ctx.drawImage(logo, 72, 40, 72, 72)
  } else {
    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 40px sans-serif'
    ctx.fillText('V', 72, 96)
  }
  ctx.fillStyle = '#f1f5f9'
  ctx.font = 'bold 40px sans-serif'
  ctx.fillText(`Verityn · ${model.lesson}`, 168, 94)
  // Headline: the measured result, in large type.
  ctx.font = 'bold 50px sans-serif'
  ctx.fillText(model.measurement, 72, 178, 660)
  // Learner prediction and follow-up facts, wrapped in the left column.
  ctx.font = '25px sans-serif'
  let y = 216
  const facts = [
    model.prediction,
    ...(model.reality === null ? [] : [`Reality check: ${model.reality}`]),
    ...(model.solo === null ? [] : [`Solo: ${model.solo}`]),
  ]
  const rows = facts.flatMap((fact) => wrapLine(fact, 46))
  for (const row of rows) {
    if (y > 412) {
      break
    }
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText(row, 72, y)
    y += 38
  }
  drawMiniCircuit(ctx, 800, 140, model.lit)
  drawRungDots(ctx, 72, 452, model.rung)
  drawMetaChips(ctx, 800, 452, model.metaTools)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '22px sans-serif'
  ctx.fillText('Computed by a solver. Not an AI score.', 72, 596)
  ctx.fillText(model.appUrl, 800, 596, 328)
  return canvas.toDataURL('image/png')
}
