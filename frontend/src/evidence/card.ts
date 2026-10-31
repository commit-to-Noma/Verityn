import type { ChapterRecap } from '../journey/story'
import { bulbReadingText, choiceDetail } from '../journey/story'
import type { TraceInput } from '../lessons/trace'

/** Shareable evidence card: session facts only, never scores or claims. */
export interface EvidenceCardModel {
  lesson: string
  prediction: string
  measurement: string
  reality: string | null
  rung: string | null
  solo: string | null
  total: number
  metaCalls: number
  rejections: number
  fallbacks: number
  appUrl: string
}

export interface TraceCountInput {
  total: number
  metaCalls: number
  rejections: number
  fallbacks: number
}

const RUNG_ORDER = ['R1', 'R2', 'R3', 'R4']

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
): EvidenceCardModel | null {
  const first = chapters[0]
  if (first?.input == null) {
    return null
  }
  const soloChapter = chapters.find((chapter) => chapter.solo)
  const soloInput = soloChapter?.input ?? null
  const realityInput = chapters[1]?.input ?? null
  return {
    lesson: first.title,
    prediction: choiceDetail(first),
    measurement: readingLine(first.input, 'L1'),
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
    model.rung === null ? 'Coach: not asked' : `Help reached: ${model.rung}`,
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
  let y = 92
  if (logo !== null) {
    ctx.drawImage(logo, 72, 40, 72, 72)
  } else {
    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 40px sans-serif'
    ctx.fillText('V', 72, 96)
  }
  ctx.fillStyle = '#f1f5f9'
  ctx.font = 'bold 44px sans-serif'
  ctx.fillText(`Verityn · ${model.lesson}`, 168, 96)
  y = 172
  ctx.font = '28px sans-serif'
  for (const line of cardLines(model).slice(1)) {
    for (const row of wrapLine(line)) {
      ctx.fillStyle = row.startsWith('Computed by a solver') ? '#94a3b8' : '#f1f5f9'
      ctx.fillText(row, 72, y)
      y += 44
    }
    y += 10
  }
  return canvas.toDataURL('image/png')
}
