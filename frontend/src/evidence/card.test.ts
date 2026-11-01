import { describe, expect, it } from 'vitest'
import type { ChapterRecap } from '../journey/story'
import type { TraceInput } from '../lessons/trace'
import { buildEvidenceCard, cardLines, metaToolChips, rungLevel, toolShortLabel, wrapLine } from './card'

function chapter(partial: Partial<ChapterRecap> = {}): ChapterRecap {
  return { id: 'L1', title: 'Light the bulb', solo: false, input: null, ...partial }
}

const SOLVED_INPUT = {
  prediction: { choice: 'no', why: 'The gap breaks the loop.' },
  result: {
    ok: true,
    components: { L1: { current: 0.6, power: 3.6 }, L2: { current: 0.6, power: 3.6 } },
  },
  verdict: { status: 'CONSISTENT' },
} as unknown as TraceInput

describe('buildEvidenceCard', () => {
  it('assembles prediction, measurement, rung, solo, and counts', () => {
    const model = buildEvidenceCard(
      [
        chapter({ input: SOLVED_INPUT }),
        chapter({
          id: 'L1T1',
          title: 'Reality check',
          input: {
            ...SOLVED_INPUT,
            coach: {
              phase: 'done',
              text: 'Q?',
              provider: 'prototype-fake',
              rung: 'R1',
              history: [{ rung: 'R2', text: 'E', provider: 'deterministic' }],
            },
          },
        }),
        chapter({ id: 'L1T2', title: 'Solo', solo: true, input: SOLVED_INPUT }),
      ],
      { total: 3, metaCalls: 0, rejections: 0, fallbacks: 1, tools: [] },
      'http://127.0.0.1:5173',
    )
    expect(model).not.toBeNull()
    expect(model?.lesson).toBe('Light the bulb')
    expect(model?.lit).toBe(true)
    expect(model?.metaTools).toEqual([])
    expect(model?.chapterLines).toEqual([
      '1 · Light the bulb: predicted No → 0.6 A · 3.6 W',
      '2 · Open switch: predicted No → 0.6 A · 3.6 W',
      '3 · Solo: predicted No → L2 0.6 A · 3.6 W',
    ])
    expect(model?.rung).toBe('R2')
    expect(model?.chapterLines[2]).toContain('L2 0.6 A · 3.6 W')
    const lines = cardLines(model ?? fail('model is null'))
    expect(lines).toContain('2 · Open switch: predicted No → 0.6 A · 3.6 W')
    expect(lines.some((line) => line.includes('Trace: 3 calls · 0 Meta'))).toBe(true)
    expect(lines.some((line) => line.includes('1 fallback') && !line.includes('1 fallbacks'))).toBe(true)
    expect(lines.at(-2)).toBe('Computed by a solver. Not an AI score.')
    expect(lines.at(-1)).toBe('http://127.0.0.1:5173')
  })

  it('shows the reading alone when the verdict is unassessable', () => {
    const model = buildEvidenceCard(
      [
        chapter({
          input: { ...SOLVED_INPUT, verdict: { status: 'UNASSESSABLE', evidence: {} } },
        }),
      ],
      { total: 0, metaCalls: 0, rejections: 0, fallbacks: 0, tools: [] },
      'http://x',
    )
    expect(model?.chapterLines[0]).toBe('1 · Light the bulb: predicted No → 0.6 A · 3.6 W')
  })

  it('adds an opted-in reflection without changing the three chapter lines', () => {
    const model = buildEvidenceCard(
      [chapter({ input: SOLVED_INPUT })],
      { total: 0, metaCalls: 0, rejections: 0, fallbacks: 0, tools: [] },
      'http://x',
      false,
      'I noticed the switch gap.',
    )
    expect(model?.chapterLines).toHaveLength(3)
    expect(cardLines(model ?? fail('model is null'))).toContain(
      'My reflection: I noticed the switch gap.',
    )
  })

  it('omits solo and rung when the session never produced them', () => {
    const model = buildEvidenceCard(
      [chapter({ input: SOLVED_INPUT })],
      { total: 0, metaCalls: 0, rejections: 0, fallbacks: 0, tools: [] },
      'http://x',
    )
    expect(model?.rung).toBeNull()
    const lines = cardLines(model ?? fail('model is null'))
    expect(lines.some((line) => line.startsWith('3 · Solo:'))).toBe(true)
    expect(lines).toContain('Coach: not asked')
  })

  it('returns null when no prediction was recorded', () => {
    expect(
      buildEvidenceCard(
        [chapter({ input: null })],
        { total: 0, metaCalls: 0, rejections: 0, fallbacks: 0, tools: [] },
        'http://x',
      ),
    ).toBeNull()
  })

  it('wraps long lines without losing words', () => {
    const rows = wrapLine('a b c d e f g h', 5)
    expect(rows.join(' ')).toBe('a b c d e f g h')
    expect(rows.every((row) => row.length <= 7)).toBe(true)
  })

  it('marks the bulb dark when solver power is at the floor', () => {
    const model = buildEvidenceCard(
      [
        chapter({
          input: {
            ...SOLVED_INPUT,
            result: { ok: true, components: { L1: { current: 0, power: 0 } } },
          } as unknown as TraceInput,
        }),
      ],
      { total: 0, metaCalls: 0, rejections: 0, fallbacks: 0, tools: [] },
      'http://x',
    )
    expect(model?.lit).toBe(false)
  })

  it('chips each Meta tool once, first-seen order, skipping others', () => {
    expect(
      metaToolChips(['muse-spark-1.3', 'template', 'muse-voice-transcribe', 'muse-spark-1.3']),
    ).toEqual(['Spark', 'Voice'])
    expect(toolShortLabel('sam-3.1')).toBe('SAM')
    expect(toolShortLabel('template')).toBeNull()
  })

  it('labels a Meta trace separately from whether the coach ladder was used', () => {
    const model = buildEvidenceCard(
      [chapter({ input: SOLVED_INPUT })],
      { total: 1, metaCalls: 1, rejections: 0, fallbacks: 0, tools: ['muse-spark-1.3'] },
      'http://x',
    )
    const lines = cardLines(model ?? fail('model is null'))
    expect(model?.metaTools).toEqual(['Spark'])
    expect(lines).toContain('Coach: not asked')
    expect(lines.some((line) => line.includes('Meta Spark'))).toBe(false)
  })

  it('maps rungs to dot levels', () => {
    expect(rungLevel(null)).toBe(0)
    expect(rungLevel('R1')).toBe(1)
    expect(rungLevel('R2')).toBe(2)
    expect(rungLevel('R4')).toBe(3)
    expect(rungLevel('R9')).toBe(0)
  })
})

function fail(message: string): never {
  throw new Error(message)
}
