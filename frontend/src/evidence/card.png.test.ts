import { describe, expect, it, vi } from 'vitest'
import type { EvidenceCardModel } from './card'
import { renderEvidencePng } from './card'

interface TextCall {
  text: string
  x: number
  y: number
  size: number
  width: number
}

function model(partial: Partial<EvidenceCardModel> = {}): EvidenceCardModel {
  return {
    lesson: 'Light the bulb',
    chapterLines: [
      '1 · Light the bulb: predicted Yes → 0.6 A · 3.6 W',
      '2 · Open switch: predicted No → 0 A · 0 W',
      '3 · Solo: Not sure → L2 0.6 A · 3.6 W',
    ],
    lit: true,
    rung: 'R2',
    total: 3,
    metaCalls: 1,
    rejections: 0,
    fallbacks: 1,
    metaTools: ['Spark', 'Voice'],
    appUrl: 'http://127.0.0.1:5173',
    ...partial,
  }
}

function installCanvasStub() {
  const texts: TextCall[] = []
  const arcs: Array<{ x: number; y: number; r: number }> = []
  let font = '10px sans-serif'
  const ctx = {
    get font() {
      return font
    },
    set font(value: string) {
      font = value
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number, maxWidth?: number) => {
      const size = Number.parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '') || 10
      const natural = String(text).length * size * 0.55
      const width = maxWidth === undefined ? natural : Math.min(natural, maxWidth)
      texts.push({ text: String(text), x, y, size, width })
    }),
    measureText: vi.fn((text: string) => ({ width: String(text).length * 12 })),
    beginPath: vi.fn(),
    arc: vi.fn((x: number, y: number, r: number) => {
      arcs.push({ x, y, r })
    }),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => 'data:image/png;base64,stub'),
  }
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    },
  )
  return { texts, arcs, canvas }
}

describe('renderEvidencePng layout', () => {
  it('keeps every text row inside 1200x630 without baseline collisions', async () => {
    const { texts, canvas } = installCanvasStub()
    try {
      await renderEvidencePng(model())
    } finally {
      vi.unstubAllGlobals()
    }
    expect(canvas.width).toBe(1200)
    expect(canvas.height).toBe(630)
    expect(texts.length).toBeGreaterThan(5)
    for (const call of texts) {
      expect(call.x).toBeGreaterThanOrEqual(0)
      expect(call.x).toBeLessThan(1200)
      expect(call.y).toBeGreaterThan(0)
      expect(call.y).toBeLessThanOrEqual(630)
    }
    for (let a = 0; a < texts.length; a++) {
      for (let b = a + 1; b < texts.length; b++) {
        const first = texts[a]
        const second = texts[b]
        const xOverlap = first.x < second.x + second.width && second.x < first.x + first.width
        if (!xOverlap) {
          continue
        }
        const gap = Math.abs(first.y - second.y)
        const needed = Math.max(first.size, second.size) * 0.75
        expect(gap, `"${first.text}" vs "${second.text}"`).toBeGreaterThanOrEqual(needed)
      }
    }
    const drawn = texts.map((call) => call.text).join(' ')
    expect(drawn).toContain('1 · Light the bulb: predicted Yes → 0.6 A · 3.6 W')
    expect(drawn).toContain('2 · Open switch: predicted No → 0 A · 0 W')
    expect(drawn).toContain('3 · Solo: Not sure → L2 0.6 A · 3.6 W')
    expect(drawn).toContain('Computed by a solver. Not an AI score.')
    expect(drawn).toContain('http://127.0.0.1:5173')
    expect(drawn).toContain('HELP LADDER')
    expect(drawn).toContain('Question')
    expect(drawn).toContain('Demonstration')
    expect(drawn).not.toContain('R1')
    expect(drawn).not.toContain('R2')
    expect(drawn).not.toContain('R4')
    expect(drawn).toContain('Meta chips are recorded calls from this app session')
  })

  it('draws three rung dots and one pill per Meta tool', async () => {
    const { arcs, texts } = installCanvasStub()
    try {
      await renderEvidencePng(model())
    } finally {
      vi.unstubAllGlobals()
    }
    const dots = arcs.filter((arc) => arc.r === 11)
    expect(dots).toHaveLength(3)
    const drawn = texts.map((call) => call.text).join('\n')
    expect(drawn).toContain('Meta Spark')
    expect(drawn).toContain('Meta Voice')
    expect(drawn).toContain('Reached Pointer')
  })

  it('omits chips and reports honestly when the session used no Meta tools', async () => {
    const { texts } = installCanvasStub()
    try {
      await renderEvidencePng(model({ metaTools: [], rung: null, lit: false }))
    } finally {
      vi.unstubAllGlobals()
    }
    const drawn = texts.map((call) => call.text).join('\n')
    expect(drawn).not.toContain('Meta Spark')
    expect(drawn).not.toContain('Meta Voice')
    expect(drawn).toContain('Coach not asked')
  })
})
